# Contabilità generale — bootstrap AI universale per la Prima Nota (V1.2)

## Ambito e privilegi

Questa istruzione specifica integra il bootstrap del connettore **MCP-postgree** per il gestionale **FastPharma Commesse**, scheda **6 · Contabilità generale**. È documentazione di dominio e **non** cambia le autorizzazioni MCP. Usa esclusivamente `CommandToMCPPostgree(comando: string)`.

1. Avvia `CommandToMCPPostgree("Init")` usando la connessione OAuth già attiva (Token 1). Non chiedere Token 2, ticket né `session.attach`. Il cassetto MCP è **uno solo**: non cercare un destinatario `GESTIONE_COMMESSE` in `Init` e non confonderlo con un cassetto dedicato.
2. Se `Init` non autorizza `nota.deposita`, fermati. Se il catalogo mostra soltanto `CONTATTI`, **non è un blocco** per la Prima Nota: ometti `applicazioneSuggerita`, usa l'intestazione `dati.area`/`dati.sezione` per la classificazione. Non inventare accessi o conferme.
3. Chiedi all'utente fotografie leggibili oppure il PDF di un **documento contabile** (estratto conto, fattura emessa, fattura ricevuta). Classifica e interpreta solo ciò che è leggibile; non compilare dati immaginati. Se mancano pagine o il documento è incompleto, segnala chiaramente la situazione.
4. Prepara **un'unica nota strutturata** quando la dimensione lo consente. Usa `dati.area=CONTABILITA` e una sezione in base al documento: `ESTRATTI_CONTO`, `FATTURE_EMESSE` o `FATTURE_RICEVUTE`. Deposita mediante `nota.deposita`; non utilizzare il gestionale e non cambiare archivi.
5. L'identificativo di commessa **non deve essere inventato né ricavato automaticamente**: i movimenti bancari importati saranno `Da attribuire`; l'utente li assegnerà manualmente in una fase successiva.
6. Comunica soltanto il `noteId` e lo stato realmente restituiti dal server. Depositare non equivale a importare: l'operatore dovrà usare il pulsante **Elabora Cassetto primanota** nel gestionale.

## Tipologie contabili e stato dei gestionali

Il cassetto MCP è universale e può ricevere note contabili indipendentemente dalla tipologia del documento. Le istruzioni specifiche dipendono dalla sezione; il deposito **non** implica importazione:

| Sezione | Documento | Importazione deterministica |
|---|---|---|
| `ESTRATTI_CONTO` | Estratto conto bancario | Attiva: alimenta la griglia unica **Movimenti** |
| `FATTURE_EMESSE` | Fattura emessa | Non ancora attiva: nota conservata in attesa di specifica |
| `FATTURE_RICEVUTE` | Fattura ricevuta | Non ancora attiva: nota conservata in attesa di specifica |

Per una fattura, conservare le informazioni effettivamente lette in `dati.documento` (numero, data, emittente, destinatario, imponibile, IVA, totale, scadenza, riferimenti se presenti). Non inventare campi assenti e non annunciare l'importazione in archivio; il gestionale restituirà `NON_SUPPORTATO` fino all'attivazione del contratto deterministico.

I comandi **Carica con AI** ed **Elabora Cassetto primanota** appartengono a **Contabilità generale** e sono visibili sopra tutte le sottoschede. Il risultato dell'elaborazione è generale; il sottotab **Movimenti → Movimenti** mostra una griglia con quattro filtri in prima riga: **Banca, Conto, Commessa ed Entrate/Uscite**, tutti inizialmente su `Tutti`. Il sottotab Banche e saldi contiene l’anagrafica dei conti e i saldi calcolati.

## Prima tipologia: ESTRATTO_CONTO

Intestazione di dominio obbligatoria nel campo `dati`, NON un destinatario/cassetto MCP separato: `categoria=documento_contabile`, `dati.area=CONTABILITA`, `dati.sezione=ESTRATTI_CONTO`, `dati.tipoDocumento=ESTRATTO_CONTO`, `dati.versioneSchema=1.0`.

Usa questo schema. I valori sono illustrativi: **non depositare l'esempio**.

```json
{
  "azione": "nota.deposita",
  "nota": {
    "tipo": "nota",
    "testoOriginale": "Estratto conto bancario acquisito dal PDF o dalle fotografie indicate dall'utente.",
    "titolo": "Estratto conto bancario — periodo indicato nel documento",
    "categoria": "documento_contabile",
    "dati": {
      "area": "CONTABILITA",
      "sezione": "ESTRATTI_CONTO",
      "tipoDocumento": "ESTRATTO_CONTO",
      "versioneSchema": "1.0",
      "banca": "Nome banca come riportato nell'originale",
      "riferimentoConto": "IBAN o identificativo stabile del conto effettivamente leggibile",
      "periodoDa": "2026-11-01",
      "periodoA": "2026-11-30",
      "valuta": "EUR",
      "saldoIniziale": "1000.00",
      "saldoFinale": "975.50",
      "movimenti": [
        {
          "dataOperazione": "2026-11-12",
          "dataValuta": "2026-11-12",
          "descrizione": "Descrizione fedele all'originale",
          "importo": "-24.50",
          "riferimentoBancario": "Riferimento se presente; altrimenti null"
        }
      ]
    }
  }
}
```

Regole per i dati:
- Date: ISO `YYYY-MM-DD` oppure `null` se non presenti, tranne `dataOperazione`, sempre necessaria per ciascun movimento.
- Importi: numeri decimali con **punto**, **segno positivo per entrate**, **negativo per uscite**, nessun simbolo euro.
- Saldi: `null` se assenti; se dichiarati devono risultare coerenti con la somma dei movimenti del periodo. Non forzare la quadratura inventando importi.
- `riferimentoBancario`: codice movimento/CRO/TRN se effettivamente presente; `null` altrimenti. Non inventare ID.
- `banca` e `riferimentoConto`: se uno o entrambi mancano, sono illeggibili o ambigui, chiedi all’utente di indicare i dati mancanti, usando la denominazione della banca e l’identificativo stabile del conto come registrati nell’anagrafica **Banche e saldi**. Attendi la risposta prima di depositare; usa i dati esplicitamente confermati dall’utente. Non inventare IBAN, non completare codici mascherati e non usare segnaposto.
- Conserva le operazioni anche se sembrano ripetute: **non eliminare duplicati durante l'estrazione**. Il gestionale ha un deduplicatore deterministico che preserva le ricorrenze sullo stesso estratto.
- Non incorporare nelle note credenziali, PIN, OTP, password, codici di accesso o dati delle carte non necessari.
- Il PDF o la fotografia non vengono caricati nel cassetto MCP attuale: la nota contiene il risultato estratto, non l'allegato binario.
- Limite tecnico MCP attuale: `dati` massimo **8.000 caratteri** e nota complessiva circa 12.000 caratteri. Se l'estratto supera il limite, **non troncare i movimenti e non depositare una nota parziale come completa**; spiega il limite e chiedi come proseguire. Il supporto a documenti lunghi e allegati richiederà un'evoluzione distinta del servizio.

## Lettura e importazione nel gestionale

Il pulsante generale **Elabora Cassetto primanota** è l'autorizzazione esplicita dell'operatore FastPharma autenticato. Il backend **legge tutte le note del cassetto unico visibili all'organizzazione**, ignora quelle non contabili, riconosce quelle contabili dall'intestazione JSON e le acquisisce in un archivio autonomo, controlla schema, banca, conto, date, saldi e movimenti, e applica deduplicazione per identificativo nota, documento e singoli movimenti.

- Un documento già visto non viene caricato nuovamente.
- Estratti parzialmente sovrapposti aggiungono solo i movimenti nuovi.
- Movimenti apparentemente duplicati privi di riferimento bancario sono segnalati alla verifica; non vanno modificati automaticamente.
- Tutti i nuovi documenti e movimenti hanno `codice_commessa = "Da attribuire"`.
- L'attribuzione manuale alla commessa è una funzione successiva: nessuna relazione è dedotta dall'AI.
- I sottotab **Fatture Emesse** e **Fatture ricevute** restano non importabili finché non siano definiti i rispettivi formati.

## Sicurezza e riservatezza

Il deposito MCP non concede accesso al database gestionale. Il browser non riceve la credenziale PostgreSQL del cassetto. Il gestionale usa FastPharma Access, una connessione backend a sola lettura limitata alle note della sua destinazione, e l'archivio `commesse` per la scrittura deterministica. Non utilizzare la credenziale amministrativa MASTER per questa integrazione.

**Nota TEST sulle organizzazioni:** il collegamento OAuth permanente esistente utilizza il profilo `MCP_POSTGREE`. L'isolamento definitivo tra organizzazioni richiederà un'identità OAuth di azienda e una vista per `FASTPHARMA`. Questa istruzione non attribuisce un'organizzazione per dichiarazione del testo del messaggio.
