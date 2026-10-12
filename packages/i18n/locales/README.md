# Translations

English (`../en.json`) is the source catalog. To start a translation:

```sh
pnpm i18n:template de   # writes packages/i18n/locales/de.json
```

Fill in the values; empty strings fall back to English. Re-run the command
after English keys change: existing translations are kept, new keys appear
empty. The web app loads the catalog lazily when the browser (or the saved
preference) asks for that language.
