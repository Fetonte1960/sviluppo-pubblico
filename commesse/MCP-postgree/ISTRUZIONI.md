# MCP-postgree — istruzioni pubbliche (Front V0.9.0 / Backend V1.8.0)

Endpoint MCP: https://mcp-postgree.onrender.com/mcp

**Unico tool pubblico:** `CommandToMCPPostgree(comando: string)`. Per iniziare invocare il comando esatto `Init`, leggere il menu effettivamente ricevuto e attendere la scelta dell'utente. Non inventare risultati né effettuare scritture automaticamente. Vietati SQL libero, DDL, DELETE fisico e ADMIN.

## Connessione OAuth permanente

La password per collegare ChatGPT e Claude è il secret `MCP_OAUTH_LOGIN_TOKEN` nel servizio Render MCP-postgree, visibile per nome in Environment. Non è `MCP_OAUTH_HMAC_KEY` (firma JWT), né `ConnectionStrings__OAuth` (accesso all'archivio dei refresh). Inserire la password SOLO nella schermata HTTPS del server aperta durante il collegamento OAuth. Non incollarla nella chat, nel laboratorio, negli URL, in issue, nei log o nei repository.

OAuth usa DCR, PKCE S256 e callback ChatGPT/Claude autorizzati; i token di accesso sono firmati con la chiave HMAC già esistente e i refresh vengono conservati in PostgreSQL, con rotazione e scadenza assoluta (default 7 giorni). La password Render non viene restituita ai connettori.

**Autorizzazioni:** di default il login permanente attribuisce soltanto `CONNECT_ONLY`, CompanyId `MCP_POSTGREE`, `AllowedApplications=[]` e nessuno schema: `Init` funziona, ma nessun dato è accessibile. Se la sua impronta SHA-256 coincide con un'identità aziendale `CONNECT_ONLY` già definita in `MCP_ACCESS_JSON`, si riutilizzano quella CompanyId e quella AllowedApplications; non si concedono privilegi implicitamente. L'accesso a un gestionale richiede il ticket monouso creato dal backend autorizzato e la sessione legata a una commessa.

## Laboratorio DEMO opzionale

Il simulatore genera una credenziale aziendale DEMO **separata e temporanea** (60 minuti o fino al restart), registra gestionali arbitrari runtime e produce ticket per dati sintetici READ_ONLY su `laboratorio_a` e `laboratorio_b`. È necessario un connettore OAuth DEMO separato per usare i ticket DEMO: la connessione permanente non appartiene all'azienda DEMO e non può agganciarli. Il refresh OAuth persistente non trasforma i token DEMO in permanenti.

## Collaudo

1. Aprire https://fetonte1960.github.io/sviluppo-pubblico/commesse/MCP-postgree/ e verificare dalla sezione server che `/health` riporti `oauthPermanentLoginConfigured=true` e `oauthEnabled=true`, con versione backend V1.8.0 o successiva.
2. Collegare ChatGPT o Claude all'endpoint MCP con autenticazione OAuth. Inserire `MCP_OAUTH_LOGIN_TOKEN` solamente nella pagina HTTPS di autorizzazione del server.
3. Accertare la presenza reale di `CommandToMCPPostgree`, invocarlo con `Init` e verificare il ruolo `CONNECT_ONLY`, `dataAccess=false` e nessun accesso ai dati senza sessione.
4. Per provare un gestionale fittizio, usare il token e la connessione OAuth DEMO separati, generare ticket di 5 minuti, associarlo con `session.attach` e operare soltanto in READ_ONLY.
5. Se una chiamata o una sessione non funziona, riferire l'errore senza simulare esiti.

La configurazione è esterna al sorgente e riproducibile su server ASP.NET Core .NET 8 locale senza Docker, con PostgreSQL locale o remoto. Per preservare connessioni OAuth già esistenti durante un trasferimento è necessario mantenere lo stesso issuer HTTPS pubblico o gestire una nuova autorizzazione.

## Catalogo MASTER applicazioni e bootstrap AI (Front V1.0.0 / Backend V1.9.0)

Il database PostgreSQL **`mcp_applications`** è separato sia dal DB delle aziende sia da `mcp_postgree_test` che ospita OAuth/DEMO. Il laboratorio contiene un pannello **Catalogo MASTER applicazioni** gestito dalla software house, con elenco app, modifica scheda, controllo revisioni e campo `ai_bootstrap_template`. Il primo record è `PRATICHE_FOTOVOLTAICO`, inizialmente in bozza, senza schemi o Root table di dati reali assegnati e con diritti solo READ_ONLY previsti.

Per usare l'editor, l'amministratore deve prima configurare **due segreti differenti dall'OAuth** sul server Render → Environment: `ConnectionStrings__Applications` (connessione al nuovo DB Neon con ruolo limitato `mcp_app_catalog_rw`) e `MCP_REGISTRY_ADMIN_TOKEN` (segreto casuale di almeno 32 caratteri). Conservare le credenziali esclusivamente nel secret store, mai in chat, Git o URL. Inserire `MCP_REGISTRY_ADMIN_TOKEN` nel campo protetto del laboratorio, poi scegliere «Carica archivio», selezionare il gestionale, modificare il bootstrap e salvare. Il browser non lo conserva in localStorage. Se le variabili sono assenti, il server restituisce `catalog_not_configured` HTTP503. Non usare `MCP_OAUTH_LOGIN_TOKEN` per amministrare il catalogo.

Il testo accetta `{{APP_CODE}}`, `{{APP_NAME}}`, `{{MCP_ENDPOINT}}`, `{{ROOT_ID}}`, `{{COMMESSA}}` e `{{TICKET}}` (obbligatorio). Quando un backend gestionale registrato tramite policy applicativa valida richiede `session-bootstrap`, MCP-postgree recupera il template MASTER abilitato e sostituisce questi campi con i valori autorizzati; il frontend usa il campo `bootstrap` della risposta. Le modifiche al testo saranno quindi disponibili senza ricompilare né ripubblicare il front gestionale. Il catalogo da solo non abilita credenziali, schemi o operazioni sui dati reali e non cambia le sessioni DEMO esistenti.
