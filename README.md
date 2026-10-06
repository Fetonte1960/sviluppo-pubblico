# Sviluppo pubblico

Repository pubblico condiviso per le commesse gestite dall'organizzazione di sviluppo.

Contiene esclusivamente artefatti deliberatamente autorizzati alla pubblicazione: siti, demo, manuali utente, installer, APK, firmware compilati, pacchetti e altri file necessari alla distribuzione pubblica.

## Struttura canonica

Le commesse pubblicate seguono lo stesso ramo logico del contenitore privato:

```text
commesse/
└── <NomeCommessa>/
    └── ...
```

Esempio:

```text
commesse/
└── Powerstation/
    ├── index.html
    ├── app/
    │   └── Powerstation.apk
    └── version.json
```

Questo repository:

- **non** è la sorgente autorevole dello sviluppo;
- **non** deve contenere copie integrali di `sviluppo-privato`;
- **non** deve contenere sorgenti privati, documentazione interna, segreti o credenziali;
- riceve soltanto file inclusi nella lista positiva definita dalla commessa privata.

La procedura di pubblicazione è definita nella relativa:

`sviluppo-privato/commesse/<NomeCommessa>/docs/PUBBLICAZIONE.md`

Salvo eccezione esplicitamente approvata, questo repository è il contenitore pubblico comune e non devono essere creati repository pubblici separati per ogni commessa.

Termodel è escluso da questa organizzazione e mantiene il proprio assetto attuale.
