# Spanska — App-specifikation

En webbapp för att lära sig spanska ord och meningar. Byggd för dyslexivänlighet,
med spaced repetition, gamification och flera spelvarianter.

---

## 1. Översikt

**Syfte:** Hjälpa en elev att lära sig spanska ord och meningar genom korta,
återkommande övningspass som anpassar sig efter vad eleven tycker är svårt.

**Målgrupp:** Elev med dyslexi som vill träna ordförråd och meningar inför
prov, läxförhör och muntliga övningar.

**Plattform:** Statisk webbapp (HTML, CSS, vanilla JavaScript). Körs lokalt
direkt från `index.html` — ingen server, inget bygg-steg, inget konto.
Framsteg sparas i webbläsarens `localStorage`.

**Språk i UI:** Svenska. Innehåll: spanska ↔ svenska.

---

## 2. Funktioner

### 2.1 Innehåll och områden
- Innehållet är uppdelat i **områden** (t.ex. "Kroppen", "Vädret",
  "Matlagningsverb"). Varje område har antingen ord, meningar, eller båda.
- Eleven kan när som helst hoppa mellan områden.

### 2.2 Studieplan
- Ett område per dag, roterar genom alla områden.
- Dagens rekommenderade område markeras på startsidan.
- Eleven kan starta om planen från valfri dag.
- Sidan "Plan" visar de kommande 14 dagarna.

### 2.3 Spel / övningstyper

För varje område finns följande övningar (som passar för innehållet):

| Övning | Typ | Riktning | Format |
|---|---|---|---|
| Ord: spanska → svenska | ord | ES → SV | 4 svarsalternativ |
| Ord: svenska → spanska | ord | SV → ES | 4 svarsalternativ |
| Meningar: spanska → svenska | meningar | ES → SV | 4 svarsalternativ |
| Meningar: svenska → spanska | meningar | SV → ES | 4 svarsalternativ |
| **Bygg meningen** | meningar | SV → ES | klicka orden i rätt ordning |

### 2.4 Övningsloop (alla spel)
- Alla kort i området läggs i en kö, blandas.
- Korrekt svar → kortet tas bort ur kön.
- Fel svar → korrekt svar visas, kortet flyttas tillbaka i kön.
- Övningen är klar när alla kort har besvarats korrekt minst en gång.

### 2.5 Talad uppläsning
- 🔊-knapp läser upp spanska ord och meningar med webbläsarens
  inbyggda taligenerator (`speechSynthesis`, lang `es-ES`).
- Tillgänglig i översiktstabeller, prompter och feedback.

### 2.6 Spaced repetition (SRS)
Efter varje rätt svar väljer eleven själv hur svårt det var:

| Knapp | Första gången | Nästa gånger |
|---|---|---|
| 😓 Svårt | + 5 min | halvera intervallet (min 5 min) |
| 🙂 Ok | + 1 dag | dubbla intervallet |
| 😎 Lätt | + 3 dagar | tredubbla intervallet |

- Fel svar → schemat nollställs till 5 min.
- Förfallna kort dyker upp på startsidan ("X kort att repetera").
- Egen flik "Repetera" mixar förfallna kort från alla områden.

### 2.7 XP- och nivåsystem
- **+5 XP** för rätt ord på första försöket (+8 för meningar).
- **+12 XP** för rätt byggd mening på första försöket.
- **+2 XP** för rätt efter ett fel.
- **+25–35 XP bonus** när en hel övning klaras.
- **+50 XP bonus** när alla övningar i ett område är klara.

10 nivåer:

| Nivå | Krav (XP) | Namn |
|---|---|---|
| 1 | 0 | Hola |
| 2 | 100 | Tiempo presente |
| 3 | 250 | Tiempo pasado |
| 4 | 500 | Tiempo futuro |
| 5 | 850 | Conversador |
| 6 | 1300 | Viajero |
| 7 | 1900 | Estudiante |
| 8 | 2700 | Experto |
| 9 | 3700 | Maestro |
| 10 | 5000 | ¡Olé! |

### 2.8 Mikro-belöningar
- Två-tons "ding" vid rätt, kort lågfrekvent ton vid fel
  (Web Audio API, inga ljudfiler).
- "+5 XP" flyter upp från det klickade alternativet.
- Konfetti-regn vid avklarad övning, fanfar-melodi.
- Nivåuppgång → centrerad popup med extra konfetti och stigande melodi.
- XP-chippet i headern pulserar vid varje XP-vinst.
- Respekterar `prefers-reduced-motion` för elever som inte vill ha animationer.

### 2.9 Statussida
- Sammanfattning: % inlärt, träffsäkerhet, antal förfallna kort.
- Per område: progress bar, träffsäkerhet, antal avklarade pass.
- **🔥 Svåraste kort just nu**: lista med kort som missas oftast,
  med nästa repetitionstidpunkt.
- Knapp för att nollställa all data.

### 2.10 Tangentbord
- `1`–`4` väljer svarsalternativ i flervalsfrågor.
- `Enter` / `mellanslag` går till nästa fråga.
- `1` Svårt / `2` Ok / `3` Lätt vid svårighetsbedömning.

---

## 3. Filstruktur

```
app/
  index.html        # Skelett: header med XP-chip + nav + main-container
  styles.css        # Allt utseende. Lexend-typsnitt. Cream/varma färger.
  data.js           # Allt innehåll: områden, ord, meningar
  app.js            # All logik: routing, quiz, builder, SRS, XP, ljud, animationer
```

Inga npm-paket. Inga CDN-beroenden förutom Lexend-fonten via Google Fonts
(fungerar även offline om fonten är cachad eller om man tar bort `<link>`
till fonten).

---

## 4. Datamodell — så lägger du in nästa års innehåll

Allt innehåll ligger i `data.js`. Strukturen:

```js
const DATA = {
  areas: [
    {
      id: "kroppen",                // unik kortform, bara a–z, 0–9, bindestreck
      name: "Kroppen",              // visningsnamn
      icon: "🧍",                   // emoji som visas i UI
      description: "Kroppsdelar",   // kort beskrivning
      words: [                      // valfritt: lista med ord
        { es: "la cabeza", sv: "huvudet" },
        { es: "el pelo",   sv: "håret" }
      ],
      sentences: [                  // valfritt: lista med meningar
        { es: "Le duele la cabeza.", sv: "Han har ont i huvudet." }
      ]
    },
    // ... fler områden
  ]
};
```

Regler:
- Varje område behöver minst en av `words` eller `sentences`.
- `id` får inte ändras efter att eleven börjat öva — annars förlorar
  området sina sparade framsteg (eftersom progress-nyckeln innehåller `id`).
- För att lägga till ett helt nytt område: lägg till ett nytt objekt
  i `areas`-listan. Det dyker upp automatiskt på startsidan, i planen,
  och får alla övningstyper som passar dess innehåll.
- "Bygg meningen"-spelet aktiveras automatiskt om området har `sentences`.

### 4.1 Tips för meningar i bygg-spelet
- Meningar splittas på mellanslag.
- Punkter, frågetecken och kommatecken stannar fästa vid sitt ord.
  ("Soy yo." → `Soy` + `yo.`)
- Korta meningar (3–8 ord) fungerar bäst pedagogiskt.
- Validering är **case-insensitive** och ignorerar extra mellanslag.

---

## 5. Sparat data (localStorage)

Nyckel: `spanska_progress_v1`. Innehåll:

```js
{
  startDate: "2026-05-15",          // när planen startade
  xp: 1240,                         // total intjänad XP
  soundEnabled: true,               // ljud på/av
  itemStats: {
    "kroppen|words|0": {
      correct: 3, wrong: 1,
      lastAnswered: 1715812345678,
      srsInterval: 1440,            // minuter till nästa repetition
      srsDueAt: 1715898745678,      // timestamp när nästa repetition förfaller
      srsReviews: 2,                // antal SRS-bedömningar gjorda
      srsLastRating: "ok"           // "hard" | "ok" | "easy"
    }
    // ... ett objekt per kort som har övats
  },
  stageCompletion: {
    "kroppen|words|es-sv": { lastCompleted: 1715812345678, runs: 3 }
    // ... ett objekt per avklarat pass
  }
}
```

**Migration mellan skolår:**
För att börja om från noll utan att tappa appen — använd
"Nollställ all framsteg" på Status-sidan. Då rensas hela `localStorage`-nyckeln.

---

## 6. Routing (URL-hash)

| Hash | Vy |
|---|---|
| `#dashboard` (eller tomt) | Startsida |
| `#plan` | 14-dagarsplan |
| `#progress` | Status & svåraste kort |
| `#area/<id>` | Översikt för ett område |
| `#quiz/<id>/<type>/<dir>` | Flerval (`type`=`words`/`sentences`, `dir`=`es-sv`/`sv-es`) |
| `#build/<id>` | Bygg meningen |
| `#review` | Repetera förfallna kort (SRS) |

---

## 7. Designval (för dyslexivänlighet)

- Typsnitt: **Lexend** (designat för läsflyt; fallback till Atkinson Hyperlegible och systemfont).
- Basstorlek: 18 px, radhöjd 1.6.
- Bakgrund: varm krämfärg (`#fbf6ec`) — undviker bländande vit yta.
- Text: mörkt brun-grått (`#2c2a26`) — mjukare än ren svart.
- Stora, rundade knappar med tydliga klickytor (min 60 px höga).
- Emoji + text på alla nav-element.
- Lugn färgpalett, sparsamt med fet stil, inga kursiva stilar.
- Varje spanskt ord/mening kan läsas upp högt med 🔊-knapp.

---

## 8. Hur du återanvänder appen nästa år

1. **Öppna `data.js`** och byt ut innehållet i `areas`-listan mot nästa
   års ordförråd. Behåll datastrukturen exakt.
2. **Behåll eller ändra `id` per område**:
   - Behåll `id` om du vill att gammal övningsdata ska följa med.
   - Ändra `id` (eller töm `localStorage`) för att börja om från noll.
3. (Valfritt) **Ändra ikonen** (`icon`) per område så de blir lätta att skilja.
4. **Justera nivå-XP** i `app.js` (sök efter `const LEVELS`) om du vill
   att det ska gå snabbare eller långsammare att stiga.
5. **Öppna `index.html` i webbläsaren** — klart.

Inget bygg-steg, ingen server. Filerna kan delas via USB, e-post,
GitHub Pages, eller laddas upp till valfri statisk webbhotell-tjänst.

---

## 9. Möjliga utbyggnader

Tankar för framtida versioner:
- Skriv-in-svaret-läge (utöver flerval) för avancerad träning.
- Verbböjningstränare (presens, pasado, futuro) — schema-baserad övning.
- Exportera/importera framsteg som JSON-fil (säkerhetskopia mellan enheter).
- Flera elev-profiler i samma webbläsare.
- Diktamen: appen läser upp en mening, eleven skriver in.
- Prov-läge: alla områden mixade, tidsbegränsat.
- Inställning för att stänga av ljud / animationer permanent.

---

*Byggd maj 2026 — för Spanska 8 hos Victor.*
