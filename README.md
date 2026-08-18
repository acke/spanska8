# 🇪🇸 spanska8

En webbapp för att träna spanska ord och meningar. Byggd för dyslexivänlighet,
med spaced repetition, XP och nivåer, och flera övningstyper.

Statisk sida — ingen server, inget bygg-steg, inga beroenden. Öppna
`index.html` i en webbläsare, eller kör den publicerade versionen på GitHub
Pages.

Den fullständiga funktionsbeskrivningen finns i [SPECIFICATION.md](SPECIFICATION.md).

## Kom igång

```sh
open index.html          # räcker för att köra appen
```

Framstegen sparas i webbläsarens `localStorage` under nyckeln
`spanska_progress_v1`. Google Drive-synk är valfritt och stängs av som
standard.

## Filer

| Fil | Innehåll |
|---|---|
| `index.html` | Sidskelett: header, XP-mätare, synkikon, navigering |
| `app.js` | Hela appen: state, routing, övningar, SRS, XP, Drive-synk |
| `data.js` | Allt innehåll — områden med ord och meningar |
| `styles.css` | Utseende, inklusive dyslexivänlig typografi (Lexend) |
| `tests.html` | Testsvit för de rena funktionerna, körs i webbläsaren |
| `run-tests.mjs` | Kör `tests.html` headless i Node |
| `SPECIFICATION.md` | Funktionsspecifikation |

## Tester

Testerna täcker de rena funktionerna — nivåberäkning, nycklar, SRS-intervall,
sammanslagning av sparad status — samt strukturen på innehållet i `data.js`
(inga dubbletter av område-id, alla ord har både `es` och `sv`, osv).

```sh
node run-tests.mjs       # headless, ger exitkod 1 om något fallerar
open tests.html          # samma svit i webbläsaren
```

`tests.html` innehåller egna kopior av funktionerna som testas, eftersom
`app.js` inte exporterar något. **Ändrar du en av dessa funktioner i `app.js`
måste kopian i `tests.html` uppdateras också** — annars testar sviten en
gammal version.

## Google Drive-synk

Valfritt. Synkar framstegen mellan datorer genom att spara en fil i Drives
dolda `appDataFolder` — den syns inte bland dina vanliga filer. Kräver ett eget
OAuth Client ID; instruktioner finns i appen under ⚙️ Inställningar.

### Hur konflikter avgörs

Synken slår ihop, den väljer inte en vinnare på tid. Det är avsiktligt:
tidsstämplar gjorde tidigare att en enhet med gammal data kunde skriva över
färsk data bara genom att öppnas.

- **Högst poäng vinner.** Av alla sparade versioner blir den med högst XP
  utgångspunkt — lägre poäng betyder alltid en äldre eller ofullständig kopia.
- **Inget kort tappas.** Övriga versioners korthistorik vägs in ovanpå:
  `correct`, `wrong` och antal genomgångar tar högsta värdet, medan
  SRS-schemat följer den enhet som svarade på kortet senast.
- **Uppladdning läser först.** Varje uppladdning hämtar Drive-filen, slår ihop
  och skriver tillbaka, så en flik som stått öppen länge inte kan radera det en
  annan enhet hunnit lägga till.
- **Sammanslagningen är idempotent och ordningsoberoende** — det spelar ingen
  roll i vilken ordning enheterna synkar.

Nettoeffekten är att synken aldrig kan sänka poängen.

### Om status ändå ser fel ut

Under ⚙️ Inställningar finns två verktyg när du är inloggad:

- **🔍 Kontrollera Drive-fil** — visar alla filer i Drive med poäng och
  tidsstämpel, jämfört med den lokala datan.
- **🛟 Återställ högsta poäng** — läser igenom alla filer *och* alla sparade
  äldre versioner i Drives revisionshistorik och tar tillbaka den med högst
  poäng. Använd den om framsteg har försvunnit; historiken finns kvar en tid
  även efter att en fil skrivits över.

Fungerar inte synken alls, kontrollera att adressen appen körs från är tillagd
som tillåtet JavaScript-ursprung på ditt OAuth Client ID i Google Cloud Console.

### Flytta status utan Drive

⚙️ Inställningar → **Exportera status** på den gamla enheten, **Importera
status** på den nya. Filen är samma JSON som sparas i `localStorage`.

## Lägga till innehåll

Nya områden läggs till i `DATA.areas` i `data.js`:

```js
{
  id: "kroppen",            // unikt, används i sparad status — ändra aldrig i efterhand
  name: "Kroppen",
  icon: "🧍",
  description: "Kroppsdelar och hur man beskriver ont",
  isNew: true,              // valfritt, ger en "Ny!"-markering
  words:     [{ es: "la cabeza", sv: "huvudet" }],
  sentences: [{ es: "Me duele la cabeza", sv: "Jag har ont i huvudet" }]
}
```

Ett område behöver `words`, `sentences` eller båda. Kör `node run-tests.mjs`
efteråt — sviten kontrollerar strukturen på allt innehåll.

⚠️ `id` och ordningen på orden i varje lista ingår i nycklarna för sparad
status (`område|typ|index`). Byter du id, eller kastar om eller tar bort ord
mitt i en lista, flyttas elevens historik till fel kort. Lägg hellre till nya
ord sist.
