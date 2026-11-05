/* Regatta Arkipelagos – ord och kategorier till bordsspelen Tickande sjömina och Pannkortet. */

// Tickande sjömina: säg något som passar, skicka vidare. Ingen får upprepa det någon redan sagt.
const MINA_CATS = [
  'Saker man har med sig i en båt', 'Öar i skärgården', 'Fiskar', 'Fåglar vid havet', 'Ord som rimmar på "hav"',
  'Saker som flyter', 'Saker som sjunker', 'Knopar och knutar', 'Delar av en segelbåt', 'Sjömanstermer',
  'Mat på en midsommarbuffé', 'Saker man grillar', 'Glassorter', 'Saker i ett sommarhus', 'Spel man spelar i stugan',
  'Väder', 'Kläder man har på sjön', 'Saker man glömmer hemma', 'Båttyper', 'Saker som är blå',
  'Saker som är gula', 'Djur som simmar', 'Ord som slutar på "-ning"', 'Svenska sommarord', 'Saker man hittar på stranden',
  'Ljud man hör i hamnen', 'Saker man packar i en picknickkorg', 'Bär och frukter', 'Skärgårdsjobb', 'Saker med hjul',
  'Saker som luktar gott', 'Ord på fyra bokstäver', 'Sporter i vatten', 'Kända sjöfarare i sagor och filmer', 'Saker som blinkar',
  'Saker man kan kasta', 'Saker som är runda', 'Ursäkter för att komma för sent', 'Saker man säger till kaptenen', 'Saker som går sönder i en båt',
];
// Bokstäver som fungerar bra på svenska.
const MINA_LETTERS = 'ABDEFGHKLMNOPRSTUV'.split('');

// Pannkortet: håll telefonen mot pannan, de andra beskriver.
const PANNA_DECKS = [
  {
    id: 'skargard', name: 'Skärgården', flag: 'A',
    words: ['Fyr', 'Brygga', 'Kobbe', 'Skär', 'Sjöbod', 'Ångbåt', 'Lotsplats', 'Badstege', 'Klippa', 'Vågbrytare', 'Sund', 'Fjärd', 'Ö', 'Kaj', 'Hamnkrog', 'Bastu', 'Utedass', 'Ekstock', 'Gästhamn', 'Strandäng', 'Tångruska', 'Sjömärke', 'Båtklubb', 'Midsommarstång', 'Sjöfågel', 'Fiskebod', 'Torparstuga', 'Sommarhus', 'Lanthandel', 'Vaktstuga', 'Grillplats', 'Kanot', 'Sjöräddning', 'Kabelfärja', 'Pendelbåt', 'Hamnkapten', 'Fritidsbåt', 'Skärgårdskryss'],
  },
  {
    id: 'batliv', name: 'Båtliv', flag: 'S',
    words: ['Ankare', 'Fender', 'Förtöjning', 'Kompass', 'Segel', 'Mast', 'Roder', 'Propeller', 'Flytväst', 'Sjökort', 'Kölvatten', 'Durk', 'Ruff', 'Sittbrunn', 'Kapell', 'Skot', 'Fall', 'Bom', 'Kryss', 'Slör', 'Läns', 'Halsa', 'Gipp', 'Reva', 'Ekolod', 'Bränsletank', 'Pump', 'Tampen', 'Pollare', 'Knop', 'Babord', 'Styrbord', 'Akter', 'För', 'Köl', 'Spinnaker', 'Navigationsljus', 'Båtshake'],
  },
  {
    id: 'havet', name: 'Havets djur', flag: 'U',
    words: ['Säl', 'Tumlare', 'Torsk', 'Abborre', 'Gädda', 'Strömming', 'Makrill', 'Lax', 'Ål', 'Krabba', 'Hummer', 'Mussla', 'Manet', 'Sjöstjärna', 'Räka', 'Havsörn', 'Fiskmås', 'Ejder', 'Skarv', 'Tärna', 'Gräsand', 'Svan', 'Gråhäger', 'Sjöhäst', 'Bläckfisk', 'Val', 'Delfin', 'Haj', 'Rocka', 'Sjöborre', 'Kräfta', 'Gös', 'Flundra', 'Sik', 'Vitfisk', 'Snäcka', 'Sjögräs', 'Plankton'],
  },
  {
    id: 'sommarmat', name: 'Sommarmat', flag: 'G',
    words: ['Sill', 'Nypotatis', 'Jordgubbstårta', 'Kräftskiva', 'Grillkorv', 'Rabarberpaj', 'Glass', 'Smultron', 'Gräddfil', 'Gräslök', 'Dill', 'Västerbottenpaj', 'Ägghalvor', 'Knäckebröd', 'Saft', 'Kaffe', 'Kanelbulle', 'Hamburgare', 'Majskolv', 'Potatissallad', 'Lax', 'Halloumi', 'Grillspett', 'Vattenmelon', 'Blåbär', 'Hallon', 'Pannkaka', 'Våffla', 'Räksmörgås', 'Toast Skagen', 'Kräm', 'Fläderblom', 'Varmkorv', 'Popcorn', 'Marshmallows', 'Picknickkorg', 'Termos'],
  },
  {
    id: 'sjoman', name: 'Sjömansord', flag: 'J',
    words: ['Skeppare', 'Gast', 'Kock', 'Styrman', 'Däck', 'Kajuta', 'Kabyss', 'Brygga', 'Hytt', 'Lanterna', 'Landkänning', 'Sjösjuk', 'Landgång', 'Hamn', 'Rederi', 'Fraktfartyg', 'Kryssare', 'Bogserbåt', 'Isbrytare', 'Fyrskepp', 'Ankarspel', 'Livbåt', 'Mayday', 'Kurs', 'Knop', 'Distansminut', 'Sextant', 'Logg', 'Vakt', 'Ombord', 'Overall', 'Sydväst', 'Sjöben', 'Kölhalning', 'Pirat', 'Skattkista', 'Flaskpost', 'Sjöodjur'],
  },
  {
    id: 'vadersol', name: 'Väder och vind', flag: 'W',
    words: ['Solsken', 'Åska', 'Regnskur', 'Dimma', 'Byig vind', 'Stiltje', 'Kuling', 'Storm', 'Molnfritt', 'Regnbåge', 'Hagel', 'Värmebölja', 'Solnedgång', 'Soluppgång', 'Midnattssol', 'Sjöbris', 'Landbris', 'Väderprognos', 'Barometer', 'Vindstrut', 'Solkräm', 'Solglasögon', 'Paraply', 'Regnställ', 'Termometer', 'Högtryck', 'Lågtryck', 'Vågor', 'Dyning', 'Ström', 'Tidvatten', 'Spegelblankt', 'Vindkantring', 'Blixt', 'Vattenkanna', 'Sandstorm'],
  },
];

if (typeof module !== 'undefined') module.exports = { MINA_CATS, MINA_LETTERS, PANNA_DECKS };
