package it.digitalcase.cassa

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.webkit.*
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import kotlin.concurrent.thread

/**
 * DigitalCase su Android.
 *
 * L'app non contiene il programma: lo carica da internet, come fa il browser sui PC.
 * In piu' espone a quel programma un canale TCP verso il registratore di cassa,
 * cosa che un browser non puo' fare. Tutta la logica resta quindi su Vercel e si
 * aggiorna da sola; questa app cambia solo se cambia il modo di parlare alla cassa.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var tastoIndietro: OnBackPressedCallback? = null
    private val memoria by lazy { getSharedPreferences("digitalcase", Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val indirizzo = memoria.getString("indirizzo", null)
        if (indirizzo.isNullOrBlank()) mostraConfigurazione(null) else apriProgramma(indirizzo)
    }

    // ─────────────────────── prima apertura: quale negozio ───────────────────────

    private fun mostraConfigurazione(errore: String?) {
        // Si lascia la pagina corrente e il tasto indietro torna al comportamento normale.
        tastoIndietro?.isEnabled = false
        if (::web.isInitialized) {
            runCatching { web.stopLoading(); web.loadUrl("about:blank") }
        }
        val d = resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()

        val colonna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(48), dp(24), dp(24))
        }

        colonna.addView(TextView(this).apply {
            text = "DigitalCase"
            textSize = 26f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })

        colonna.addView(TextView(this).apply {
            text = if (errore == null) "Indica il negozio da aprire."
                   else "Non riesco ad aprire il programma.\n\n" + errore
            textSize = 15f
            setPadding(0, dp(12), 0, dp(24))
        })

        val campo = EditText(this).apply {
            hint = "nome del negozio"
            setText(memoria.getString("indirizzo", "") ?: "")
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine()
        }
        colonna.addView(campo)

        colonna.addView(TextView(this).apply {
            text = "Basta il nome, per esempio  cabiria\nL'indirizzo completo va bene lo stesso."
            textSize = 13f
            setPadding(0, dp(8), 0, dp(20))
        })

        colonna.addView(Button(this).apply {
            text = "APRI IL PROGRAMMA"
            textSize = 16f
            setOnClickListener {
                val scritto = campo.text.toString().trim()
                if (scritto.isEmpty()) return@setOnClickListener
                val completo = completaIndirizzo(scritto)
                memoria.edit().putString("indirizzo", completo).apply()
                apriProgramma(completo)
            }
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

        setContentView(ScrollView(this).apply { addView(colonna) })
    }

    /** "cabiria" diventa "https://cabiria.digitalcase.it"; un indirizzo completo resta com'e'. */
    private fun completaIndirizzo(scritto: String): String {
        var s = scritto.trim().trimEnd('/')
        if (s.startsWith("http://") || s.startsWith("https://")) return s
        if (!s.contains(".")) s = "$s.digitalcase.it"
        return "https://$s"
    }

    // ─────────────────────────── il programma ───────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun apriProgramma(indirizzo: String) {
        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // il programma usa molto la memoria del browser
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        WebView.setWebContentsDebuggingEnabled(true)

        web.addJavascriptInterface(PonteRT(), "DigitalCaseRT")

        web.webViewClient = object : WebViewClient() {
            override fun onReceivedError(v: WebView?, req: WebResourceRequest?, err: WebResourceError?) {
                // Solo l'errore della pagina principale fa tornare alla configurazione:
                // un'immagine che non carica non deve buttare fuori il cassiere.
                if (req?.isForMainFrame == true) {
                    mostraConfigurazione("Indirizzo: $indirizzo\n" + (err?.description ?: "pagina non raggiungibile"))
                }
            }
        }

        web.webChromeClient = WebChromeClient()

        // Il tasto indietro naviga dentro il programma; a fondo cronologia chiede conferma,
        // perche' una cassa non deve chiudersi per uno sfioramento.
        if (tastoIndietro == null) {
            tastoIndietro = object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (web.canGoBack()) web.goBack() else menuUscita()
                }
            }
            onBackPressedDispatcher.addCallback(this, tastoIndietro!!)
        } else {
            tastoIndietro?.isEnabled = true
        }

        setContentView(web)
        web.loadUrl(indirizzo)
    }

    private fun menuUscita() {
        AlertDialog.Builder(this)
            .setTitle("DigitalCase")
            .setMessage("Cosa vuoi fare?")
            .setNeutralButton("Cambia negozio") { _, _ -> mostraConfigurazione(null) }
            .setNegativeButton("Resta qui", null)
            .setPositiveButton("Chiudi") { _, _ -> finish() }
            .show()
    }

    // ─────────────────────── il canale verso la cassa ───────────────────────

    /**
     * Esposto al programma come window.DigitalCaseRT.
     * Fa solo da postino: riceve una lista di comandi gia' pronti, li manda in sequenza
     * e restituisce l'ultima risposta. Nessuna logica di cassa qui dentro, cosi' resta
     * tutta su Vercel e si aggiorna senza reinstallare l'app.
     */
    inner class PonteRT {

        @JavascriptInterface
        fun versione(): Int = 1

        /**
         * @param id          identificativo della richiesta, torna indietro con la risposta
         * @param ip          indirizzo della cassa
         * @param porta       porta della cassa
         * @param comandiJson lista di comandi, p.es. ["88F"] oppure ["z","1F","c"]
         * @param attendi     true per aspettare la risposta, false per i soli invii
         *                    (stampante delle comande, che non risponde)
         */
        @JavascriptInterface
        fun invia(id: String, ip: String, porta: Int, comandiJson: String, attendi: Boolean) {
            thread {
                val esito = JSONObject().put("id", id)
                try {
                    val lista = JSONArray(comandiJson)
                    var ultima = ""
                    for (i in 0 until lista.length()) {
                        ultima = mandaUno(ip, porta, lista.getString(i), attendi)
                        if (i < lista.length() - 1) Thread.sleep(200)
                    }
                    esito.put("ok", true).put("risposta", ultima)
                } catch (e: Exception) {
                    esito.put("ok", false).put("errore", e.message ?: e.toString())
                }
                val js = "window.__digitalcaseRTesito && window.__digitalcaseRTesito(" +
                    JSONObject.quote(esito.toString()) + ")"
                runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(js, null) }
            }
        }
    }

    /** Come inviaTCP3iRaw in service.js: comando + CR, timeout 3 s, si tiene cio' che arriva. */
    private fun mandaUno(ip: String, porta: Int, comando: String, attendi: Boolean): String {
        val socket = Socket()
        try {
            socket.connect(InetSocketAddress(ip, porta), TIMEOUT)
            socket.soTimeout = TIMEOUT
            val out = socket.getOutputStream()
            out.write((comando + "\r").toByteArray(Charsets.ISO_8859_1))
            out.flush()
            if (!attendi) return "OK"

            val letto = StringBuilder()
            val buffer = ByteArray(4096)
            try {
                while (true) {
                    val quanti = socket.getInputStream().read(buffer)
                    if (quanti <= 0) break
                    letto.append(String(buffer, 0, quanti, Charsets.ISO_8859_1))
                    if (letto.contains("@@")) break
                }
            } catch (e: SocketTimeoutException) {
                // La cassa ha smesso di parlare: si tiene quello che e' arrivato.
            }
            return if (letto.isEmpty()) "OK" else letto.toString()
        } finally {
            runCatching { socket.close() }
        }
    }

    companion object {
        private const val TIMEOUT = 3000
    }
}
