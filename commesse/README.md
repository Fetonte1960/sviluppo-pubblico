# Commesse / Progetti pubblicati

In questa cartella vengono creati esclusivamente i rami delle **commesse/progetti** che possiedono almeno un contenuto autorizzato alla pubblicazione.

I termini **commessa** e **progetto** sono equivalenti; la denominazione canonica della cartella resta `commesse/`.

## Corrispondenza con il repository privato

Il nome della commessa deve essere identico nei due contenitori:

```text
sviluppo-privato/commesse/<NomeCommessa>/
sviluppo-pubblico/commesse/<NomeCommessa>/
```

Quando un artifact proviene da un sottoprogetto tecnico, va mantenuto il relativo sottopercorso logico quando applicabile, per esempio:

```text
commesse/<NomeCommessa>/app/android/
commesse/<NomeCommessa>/firmware/
```

Nel pubblico vengono creati soltanto i rami necessari agli artifact deliberatamente autorizzati.

La presenza di una commessa nel repository privato non autorizza né implica la sua presenza in questo repository.
