# Copertine personalizzate

Per dare a una playlist condivisa una copertina personalizzata (invece di
quella generica con icona e titolo), aggiungi qui l'immagine e una voce in
`copertine.json` (nella cartella principale del repo).

## Come fare

1. Carica l'immagine in questa cartella (`copertine/`), qualunque nome —
   es. `Corpus Domini.png`.
2. In `copertine.json`, aggiungi una voce con il **nome esatto della
   playlist** come chiave:

```json
{
  "Corpus Domini": {
    "occasione": "Corpus Domini",
    "data": "Domenica 7 Giugno",
    "orario": "10:30",
    "immagine": "Corpus Domini.png"
  }
}
```

Tutti i campi tranne `immagine` sono facoltativi. Se manca `occasione`,
viene usato il nome della playlist. Se la playlist non ha una voce qui (o
l'immagine indicata non esiste), l'export usa la copertina generica come
prima — nessun errore per l'utente.
