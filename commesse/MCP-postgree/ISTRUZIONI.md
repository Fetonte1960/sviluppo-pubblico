# MCP-postgree — Istruzione pubblica di avvio

**Frontend test:** V0.2.1 (incrementare progressivamente a ogni release).
**Server:** leggere la versione effettiva da \`GET /health\`, senza supporre una versione in assenza di connessione.

## Scopo e contratto

MCP-postgree è un gateway per PostgreSQL aziendali con accesso controllato e isolato per gestionale.
Il **solo tool MCP pubblico** è \`CommandToMCPPostgree(comando: string)\`.
Per iniziare, chiamare il tool con \`comando = "Init"\`, quindi leggere il menu dinamico e attendere la scelta dell'utente.

Comandi JSON supportati secondo policy: schemi, tabelle, struttura, leggi, cerca, conta, inserisci e aggiorna.
Non eseguire SQL arbitrario, DDL, cancellazioni fisiche o comandi ADMIN. Le scritture richiedono policy READ_WRITE, audit e controllo di concorrenza.

## Token

Ogni gestionale ha un token casuale generato localmente. Il token viene inviato al connettore MCP tramite \`Authorization: Bearer\`; **non va mai scritto nel prompt, in chat, nell'URL di lancio, in GitHub o in log**.
Generare un token non conferisce accesso agli archivi aziendali. L'amministratore registra la sua impronta SHA-256 nel secret store del backend con database/profilo, ruolo, schemi, tabelle e colonne esplicitamente autorizzati. La policy di default è deny.

La pagina statica GitHub Pages registra automaticamente o su comando un token di prova a scadenza (60 minuti) sul **solo server demo Render Free**, associandolo a READ_ONLY sui due schemi fittizi laboratorio_a e laboratorio_b. L'identificativo gestionale e il ruolo richiesto nella pagina non possono elevare queste autorizzazioni. La registrazione avviene inviando solo SHA-256 del token via HTTPS, non il token segreto. Nessun token aziendale viene autoregistrato.

## Avvio GPT

1. Aprire il laboratorio web.
2. Specificare l'URL del backend HTTPS se disponibile.
3. Fare clic su \`Risveglia / verifica\`: Render Free può impiegare tempo a partire.
4. Fare clic su \`Apri GPT con istruzioni\` oppure copiare l'istruzione e incollarla nella chat.
5. Verificare che il connettore MCP sia stato aggiunto e autorizzato **separatamente** nel client ChatGPT.
6. Solo quando il tool è realmente presente, chiamare \`CommandToMCPPostgree("Init")\`.

Non dichiarare alcun collegamento riuscito se la chat non espone realmente il tool. Le credenziali del connettore vengono gestite dal client/gestionale e non dall'istruzione di bootstrap.

## Diagnostica e risveglio

L'endpoint HTTPS \`/health\` è anonimo e deve rendere \`ok\`, \`service\`, \`version\` e \`commit\`.
La versione frontend è sempre mostrata sulla barra superiore, indipendentemente dalla rete.
La versione server viene indicata soltanto dopo una risposta \`/health\` valida.
Il polling di risveglio termina automaticamente al successo, alla scadenza o quando l'utente lo interrompe. Se non è stato configurato alcun backend, lo stato rimane \`Non configurato\`.

## Sicurezza e limiti

Il test diretto \`initialize\` + \`tools/list\` + \`tools/call Init\` dal browser non richiede la distribuzione del token a ChatGPT, ma comporta una richiesta HTTPS al server impostato dall'operatore. Verificare accuratamente il dominio destinatario prima di utilizzare un token attivo.
Connettersi al client ChatGPT non è equivalente a fare il test nel browser.
Non usare database reali fino ad autorizzazione esplicita.
