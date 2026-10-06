# Sviluppo pubblico

Questo repository è il contenitore pubblico condiviso delle **commesse/progetti** gestiti dall'organizzazione di sviluppo.

Contiene esclusivamente artifact deliberatamente autorizzati alla pubblicazione: siti, demo, manuali utente, installer, APK, firmware compilati, pacchetti e altri file destinati all'uso pubblico.

## Terminologia

I termini **commessa** e **progetto** sono equivalenti e indicano la stessa unità organizzativa.

Come nel contenitore privato, la struttura Git canonica usa sempre:

`commesse/<NomeCommessa>/`

Non deve essere creata una gerarchia parallela `progetti/`.

Il termine **sottoprogetto** può indicare una componente tecnica interna della stessa commessa.

## Struttura canonica

Il ramo logico deve essere lo stesso del contenitore privato:

```text
sviluppo-pubblico/
└── commesse/
    └── <NomeCommessa>/
        └── artifact pubblici autorizzati
```

Una commessa/progetto presente in `sviluppo-privato` **non deve essere creata automaticamente qui**.

La relativa cartella pubblica viene creata soltanto quando:
- esiste un contenuto realmente destinato alla pubblicazione;
- il perimetro pubblico è stato autorizzato;
- la procedura è documentata nel repository privato.

## Regole di contenuto

Questo repository:

- **non** è la sorgente autorevole dello sviluppo;
- **non** deve contenere copie integrali di `sviluppo-privato`;
- **non** deve contenere sorgenti privati;
- **non** deve contenere documentazione interna;
- **non** deve contenere segreti o credenziali;
- riceve soltanto file inclusi nella lista positiva definita dalla commessa/progetto privato.

La procedura di pubblicazione è definita in:

`sviluppo-privato/commesse/<NomeCommessa>/docs/PUBBLICAZIONE.md`

Salvo eccezione esplicitamente approvata, questo repository è il contenitore pubblico comune e non devono essere creati repository pubblici separati per ogni commessa/progetto.

## Corrispondenza con il privato

```text
sviluppo-privato/
└── commesse/
    └── <NomeCommessa>/
        └── sorgenti e documentazione interna

sviluppo-pubblico/
└── commesse/
    └── <NomeCommessa>/
        └── soli artifact autorizzati
```

Termodel è escluso da questa organizzazione e mantiene il proprio assetto specifico.
