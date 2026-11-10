# MCP-postgree — Istruzione pubblica di avvio

**Frontend test:** V0.4.0 (incrementare progressivamente a ogni release).
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

## Collegare ChatGPT a MCP-postgree mediante OAuth 2.1

URL della connessione MCP:
https://mcp-postgree.onrender.com/mcp

1. Nel laboratorio premi **Genera token e attiva demo**. Premi **Copia** sul token segreto generato.
2. Aggiungi MCP-postgree tra le connessioni di ChatGPT, con l'URL MCP indicato sopra e modalità **OAuth**.
3. Il client scoprirà automaticamente \`/.well-known/oauth-protected-resource\` e \`/.well-known/oauth-authorization-server\`, registrerà il client OAuth in DCR e avvierà l'autorizzazione Code + PKCE S256.
4. Sul form HTTPS del server \`mcp-postgree.onrender.com\`, incolla il token di gestionale e premi **Autorizza il collegamento**. Non incollarlo nella chat GPT.
5. ChatGPT riceverà soltanto un access token OAuth distinto e limitato alla risorsa MCP; il server lo riconduce alle policy del token originario.
6. Esegui \`CommandToMCPPostgree("Init")\`. La demo consente solo READ_ONLY sui due schemi sintetici.

Il codice OAuth è monouso, l'access token ha durata massima 30 minuti e il token demo scade dopo 60 minuti o al riavvio di Render Free. Non vengono attualmente emessi refresh token: ripetere l'autorizzazione quando necessario. L'identità dimostrativa è il gestionale associato al token, **non** un account personale verificato. L'uso in produzione con utenti nominativi richiede un provider di identità approvato.

### Endpoint pubblici OAuth

- https://mcp-postgree.onrender.com/.well-known/oauth-protected-resource
- https://mcp-postgree.onrender.com/.well-known/oauth-authorization-server

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

## Registrazione OAuth DCR V1.4.0

Il server accetta callback ChatGPT autorizzati, anche multipli, e richieste di registrazione che includono il grant `refresh_token`. La risposta mantiene soltanto `authorization_code`: non sono ancora emessi refresh token. I callback di domini diversi da ChatGPT continuano a essere bloccati.

## Ritorno automatico a ChatGPT (OAuth V1.4.0)

Il server risponde al consenso con redirect HTTP 303 (GET) verso il callback autorizzato ChatGPT. La politica CSP dell'HTML di login ammette esplicitamente il ritorno su https://chatgpt.com e lo script protetto da nonce evita un doppio invio. Dopo aver cliccato «Autorizza il collegamento» una volta, attendere il ritorno a ChatGPT; non premere nuovamente. Se il flusso viene interrotto, ripartire da ChatGPT e generare una nuova richiesta di collegamento.


## Collegamento Claude AI — 10/11/2026

Lo stesso server MCP \`https://mcp-postgree.onrender.com/mcp\` permette la registrazione automatica OAuth DCR con i due callback **esatti** autorizzati:
- \`https://claude.ai/api/mcp/auth_callback\`
- \`https://claude.com/api/mcp/auth_callback\`

I callback ChatGPT esistenti continuano a funzionare. L'endpoint \`POST /oauth/register\` accetta richieste con \`token_endpoint_auth_method=none\` e \`grant_types=["authorization_code","refresh_token"]\`. Nessun dominio esterno è ammesso. Il consenso presenta un modulo sul server Render: inserire il token *solo sul modulo*, mai nella chat Claude.

L'access token OAuth resta di durata 30 minuti; il refresh token è opaco, monouso a rotazione, revocabile tramite \`POST /oauth/revoke\`, legato a client ID, risorsa \`/mcp\` e policy originaria del gestionale. \`MCP_OAUTH_REFRESH_DAYS\` imposta la durata della famiglia di refresh (1–30 giorni; predefinita 7). **Il registro è volatile:** un riavvio del servizio Render Free invalida anche i refresh token non scaduti. Per uso in produzione durevole serve storage dedicato approvato.

L'ambiente DEMO resta READ_ONLY su due schemi sintetici di Neon. I token demo scadono dopo 60 minuti e non possono essere prolungati tramite refresh senza una policy sorgente ancora valida.


## Sessioni aziendali con ticket di bootstrap — V0.5.0 / Backend V1.5.0 (10/11/2026)

Il pannello **05 — Sessione applicativa** prepara una prova isolata per due applicativi sul database sintetico Neon esistente, senza scritture e senza nuovi archivi:
- identità aziendale demo OAuth con ruolo \`CONNECT_ONLY\`, nessun accesso ai dati;
- \`APP_A\` autorizzata soltanto a \`laboratorio_a.casi\`, \`APP_B\` soltanto a \`laboratorio_b.catalogo\`;
- il backend dell'applicativo usa la sua credenziale dedicata per \`POST /api/mcp-postgree/v1/session-bootstrap\` e ottiene un ticket monouso valido 5 minuti;
- il bootstrap della chat include solo il ticket, mai il token OAuth aziendale né la credenziale dell'app;
- chiamata iniziale dell'AI: \`CommandToMCPPostgree("{\"azione\":\"session.attach\",\"ticket\":\"mcp_ticket_...\"}")\`;
- l'MCP verifica OAuth \`CONNECT_ONLY\`, azienda e allowlist di applicativi, associa applicativo e commessa e restituisce session token, Root generale e Root applicativa;
- ogni comando successivo deve essere JSON con campo \`session\` e usa soltanto la policy del relativo applicativo, con filtro SQL aggiuntivo sul campo commessa;
- senza session valida: \`session_required\`, senza permesso per lo schema: \`forbidden\`; \`session.close\` invalida il token;
- i ticket e le sessioni sono volatili su Render Free, così come le autorizzazioni OAuth di prova. Un riavvio richiede un nuovo bootstrap.

**Test in browser:** aprire il pannello 05, selezionare \`APP A\` e commessa \`1\`, generare il bootstrap; copiare il **token aziendale DEMO** soltanto nel modulo OAuth di ChatGPT/Claude quando si collega il connettore. Copiare il bootstrap nella nuova chat. Ripetere con \`APP B\`. Il token che identifica la commessa NON viene inserito nella schermata OAuth.

**Sicurezza:** la modalità legacy con token senza CompanyId resta invariata. In modalità enterprise la policy \`CONNECT_ONLY\` non può leggere dati; il token dell'applicativo non è accettato per accesso diretto MCP né per login OAuth, solo per emettere ticket lato backend. Le Root di produzione provengono dalla configurazione riservata \`MCP_ACCESS_JSON\` e non ancora da Neon. Nessun database aziendale è stato collegato.


## Simulatore Pratiche Fotovoltaico — frontend V0.6.0, backend V1.5.1

Il laboratorio pubblico può ora simulare, senza aprire il gestionale, il lancio dell'applicativo **Pratiche Fotovoltaico** con la struttura di sicurezza azienda → applicativo → commessa. La simulazione non usa né pretende di usare il vero database Pratiche Fotovoltaico: impiega il dataset artificiale \`laboratorio_a.casi\` nel Neon di test READ_ONLY; \`id\` simula una commessa (1 o 2) ai soli fini del collaudo.

Nella nuova sezione prominente **Simulatore gestionale**:
1. **Solo primo collegamento OAuth DEMO:** cliccare \`Prepara token aziendale DEMO\`, poi copiare il token 1 e inserirlo nella **pagina protetta di consenso OAuth del server**, non nel testo della chat. Se il connettore ChatGPT/Claude è già autorizzato con una credenziale demo aziendale \`CONNECT_ONLY\` valida, non serve premere né reinserire token 1. Il token per la demo ha una scadenza effettiva di 60 minuti e può richiedere riconnessione dopo scadenza o restart Render.
2. Selezionare \`Pratiche Fotovoltaico · simulazione\` e il codice commessa (per esempio \`1\`).
3. Cliccare \`Genera ticket e bootstrap\`: il frontend registra un token backend applicativo temporaneo (solo nel browser in memoria) e invoca \`POST /api/mcp-postgree/v1/session-bootstrap\`. Il ticket monouso resta valido cinque minuti. Non è necessario aprire il gestionale reale.
4. Copiare il bootstrap e aprire ChatGPT o Claude dai pulsanti. L'apertura della chat **non** spedisce il ticket in URL: il prompt va incollato nella chat aperta. La chat già collegata mediante OAuth chiama \`CommandToMCPPostgree\` con \`session.attach\`, ottiene il token session e le due Root; poi può effettuare soltanto i comandi READ_ONLY autorizzati per quella commessa.
5. Per testare isolamento, scegliere \`Applicativo B\`, generare un **nuovo** ticket, e verificare che gli schemi e le Root del primo applicativo non siano disponibili.

Limitazioni: il laboratorio non può installare automaticamente un connettore nella UI ChatGPT/Claude; la conferma OAuth va completata nell'app AI una tantum. Le Root del simulatore sono quelle in V1.5.1 su server, non provengono dall'editor Neon Gestione_istruzione_AI. Nessun token vero aziendale va immesso in questo sito pubblico. I ticket e le sessioni sono conservati solo in RAM Render e scadono. L'attuale profilo di test è READ_ONLY; non abilita modifiche a pratiche reali.


## Registro gestionali dinamico demo — Front V0.7.0 / Backend V1.6.0

Rettifica architetturale: l'applicativo **Pratiche Fotovoltaico non è presente nel codice del server**. Il server universale supporta un numero configurato di gestionali e la demo permette la registrazione a runtime, senza rebuild/deploy, di un massimo di 16 applicativi per azienda demo. Il laboratorio può aggiungere qualsiasi nome/identificativo di applicativo e assegnargli uno dei due dataset sintetici consentiti (\`laboratorio_a\` o \`laboratorio_b\`). Non concede mai accesso a schemi arbitrari o reali.

Procedura frontend: 1) preparare il token aziendale demo e autorizzare una volta OAuth in ChatGPT/Claude; 2) inserire il nome, l'ID e il dataset del gestionale e cliccare Registra gestionale di prova; 3) scegliere un applicativo già registrato, indicare la commessa e generare ticket/bootstrap; 4) trasferire il bootstrap alla chat.

Il backend usa il **medesimo** endpoint demo già esistente \`POST /demo/register\`: in caso di registrazione applicativa richiede anche \`Authorization: Bearer <token-azienda-demo>\` e i campi \`applicationId\`, \`applicationName\`, \`dataset\`. Verifica che il token aziendale sia CONNECT_ONLY e assegna l'applicativo a **quella** azienda. Le autorizzazioni sono in RAM con TTL, non persistenti; le policy reali restano in \`MCP_ACCESS_JSON\` e si configurano senza ricompilare il software (ma un cambio delle variabili Render può comportare un riavvio). Nessun nuovo schema o privilegio PostgreSQL.

La Root applicativa viene generata a runtime dal registro delle app demo. Il catalogo demo non è un sistema amministrativo definitivo per aziende reali.


## Refresh OAuth persistente — backend V1.7.0 / frontend V0.8.0

Il progetto MCP-postgree utilizza il database Neon già dedicato al connettore (non i DB dei clienti) per la rotazione persistente dei refresh token. La tabella separata \`mcp_oauth.refresh_grants\` conserva **solamente hash SHA-256**, famiglia, client OAuth, resource, policy fingerprint, scadenza assoluta e flag used/revoked. Il ruolo \`mcp_oauth_writer\` ha permessi sullo schema OAuth; le credenziali della connessione sono segreti Render \`ConnectionStrings__OAuth\` e \`MCP_OAUTH_REFRESH_PERSISTENCE=postgresql\`.

Il server mantiene invariati \`MCP_OAUTH_HMAC_KEY\`, client_id DCR generati con firma, endpoints OAuth, scope e tool \`CommandToMCPPostgree(comando: string)\`. Il refresh token dura 1–30 giorni (predefinito 7), non si estende oltre la scadenza assoluta originaria; il rinnovo è atomico, i replay revocano l'intera famiglia. In caso di guasto DB il token non viene trasformato in grant volatile; il server risponde \`temporarily_unavailable\` HTTP503, così il client può riprovare.

**Distinzione essenziale**: questa persistenza riguarda l'autorizzazione OAuth quando la sua policy aziendale sorgente è stabile in \`MCP_ACCESS_JSON\`. I token **DEMO** di 60 minuti rimangono nella RAM del server, si perdono al riavvio e non costituiscono una connessione aziendale persistente. La sessione di commessa e il ticket bootstrap restano temporanei (30 / 5 minuti). Se il connettore era già autorizzato con una vecchia famiglia refresh volatile, è necessaria una nuova autorizzazione iniziale dopo il cambio di storage; le nuove famiglie usano PostgreSQL. Il pannello server mostra il tipo di persistenza rilevato da \`/health\`.

Nessun cambio dei dati delle pratiche vere; la tabella OAuth è nello schema dedicato del database di collaudo MCP-postgree.
