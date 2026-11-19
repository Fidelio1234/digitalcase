package it.digitalcase.prova

import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import kotlin.concurrent.thread

/**
 * Prova del collegamento fra un tablet Android e un registratore di cassa 3i.
 *
 * Replica quello che fa service.js sul PC Windows (inviaTCP3iRaw):
 * apre un socket, scrive il comando seguito da CR, legge finche' la cassa
 * chiude o tace, e tiene quello che e' arrivato.
 */
class MainActivity : AppCompatActivity() {

    private val TIMEOUT = 3000

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val d = resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()

        val colonna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(20))
        }

        fun etichetta(testo: String) = TextView(this).apply {
            text = testo
            textSize = 13f
            setPadding(0, dp(12), 0, dp(4))
        }

        val titolo = TextView(this).apply {
            text = "DigitalCase — prova collegamento cassa"
            textSize = 19f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }

        val campoIp = EditText(this).apply {
            setText("192.168.1.")
            hint = "Indirizzo della cassa"
            inputType = InputType.TYPE_CLASS_TEXT
            setSingleLine()
        }

        val campoPorta = EditText(this).apply {
            setText("1723")
            hint = "Porta"
            inputType = InputType.TYPE_CLASS_NUMBER
            setSingleLine()
        }

        val campoComando = EditText(this).apply {
            setText("88F")
            hint = "Comando"
            inputType = InputType.TYPE_CLASS_TEXT
            setSingleLine()
        }

        val esito = TextView(this).apply {
            textSize = 15f
            setTextIsSelectable(true)
            setPadding(dp(14), dp(14), dp(14), dp(14))
            typeface = android.graphics.Typeface.MONOSPACE
            text = "Pronto.\n\n88F chiede alla cassa chi e': matricola, versione,\nnumero di chiusura e invii in attesa.\nNon stampa niente e non modifica niente."
        }

        val bottone = Button(this).apply {
            text = "MANDA ALLA CASSA"
            textSize = 16f
        }

        bottone.setOnClickListener {
            val ip = campoIp.text.toString().trim()
            val porta = campoPorta.text.toString().trim().toIntOrNull() ?: 0
            val comando = campoComando.text.toString().trim()
            if (ip.isEmpty() || porta <= 0 || comando.isEmpty()) {
                esito.text = "Compila indirizzo, porta e comando."
                return@setOnClickListener
            }
            bottone.isEnabled = false
            esito.setTextColor(Color.GRAY)
            esito.text = "Chiamo $ip:$porta ..."
            thread {
                val inizio = System.currentTimeMillis()
                val r = runCatching { manda(ip, porta, comando) }
                val durata = System.currentTimeMillis() - inizio
                runOnUiThread {
                    bottone.isEnabled = true
                    r.onSuccess { risposta ->
                        esito.setTextColor(Color.parseColor("#0a7d4f"))
                        esito.text = "RISPOSTA in ${durata} ms:\n\n" + leggibile(risposta) +
                            "\n\n" + commenta(risposta)
                    }
                    r.onFailure { e ->
                        esito.setTextColor(Color.parseColor("#b00020"))
                        esito.text = "NESSUNA RISPOSTA dopo ${durata} ms\n\n" +
                            (e.message ?: e.toString()) +
                            "\n\nControlla che il tablet sia sulla stessa rete della cassa\ne che indirizzo e porta siano giusti."
                    }
                }
            }
        }

        colonna.addView(titolo)
        colonna.addView(etichetta("Indirizzo"))
        colonna.addView(campoIp)
        colonna.addView(etichetta("Porta"))
        colonna.addView(campoPorta)
        colonna.addView(etichetta("Comando"))
        colonna.addView(campoComando)
        colonna.addView(bottone, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
            topMargin = dp(20)
        })
        colonna.addView(esito, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
            topMargin = dp(20)
        })

        setContentView(ScrollView(this).apply { addView(colonna) })
    }

    /** Come inviaTCP3iRaw in service.js: scrive il comando + CR e legge quello che torna. */
    private fun manda(ip: String, porta: Int, comando: String): String {
        val socket = Socket()
        try {
            socket.connect(InetSocketAddress(ip, porta), TIMEOUT)
            socket.soTimeout = TIMEOUT
            val out = socket.getOutputStream()
            out.write((comando + "\r").toByteArray(Charsets.ISO_8859_1))
            out.flush()

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
                // La cassa ha smesso di parlare: si tiene quello che e' arrivato,
                // esattamente come fa il service sul PC.
            }
            return letto.toString()
        } finally {
            runCatching { socket.close() }
        }
    }

    /** Rende visibili i caratteri di controllo (XON, XOFF, CR). */
    private fun leggibile(s: String): String {
        if (s.isEmpty()) return "(vuota)"
        val b = StringBuilder()
        for (c in s) {
            when {
                c.code == 17 -> b.append("<XON>")
                c.code == 19 -> b.append("<XOFF>")
                c.code == 13 -> b.append("<CR>")
                c.code == 10 -> b.append("<LF>")
                c.code < 32 -> b.append("<").append(c.code).append(">")
                else -> b.append(c)
            }
        }
        return b.toString()
    }

    /** Due parole su cosa significa la risposta, per capirlo senza manuale. */
    private fun commenta(s: String): String {
        if (s.contains("#") && s.contains("@@")) {
            val campi = s.replace(Regex("[\\x00-\\x1f]"), "").substringBefore("@@").split("#")
            if (campi.size >= 6) {
                return "Matricola: ${campi[0]}\nVersione: ${campi[1]}\n" +
                    "Ultima chiusura: ${campi[4]}\nInvii in attesa: ${campi[5]}\n\n" +
                    "COLLEGAMENTO RIUSCITO."
            }
        }
        if (s.contains('\u0013')) return "La cassa ha risposto XOFF: comando non riconosciuto\no cassa occupata. Il collegamento pero' funziona."
        if (s.isEmpty()) return "Collegamento aperto ma nessuna risposta."
        return "Risposta ricevuta."
    }
}
