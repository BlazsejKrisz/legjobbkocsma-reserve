# A foglalási rendszer funkciói

---

## Foglalási csatornák

A vendégek a következő módokon kerülhetnek a rendszerbe:

- **Weboldali űrlap (embed)** — a helyszín saját weboldalába beépített
  foglalási modul.  Ezeket a foglalásokat a rendszer `web` forrásként
  rögzíti.
- **Telefonon a recepciónál** — az ügyfélszolgálat felveszi a hívást,
  és a felületen (pl. „Ellenőrzött foglalás” oldalon vagy az „Új
  foglalás” gombbal) rögzíti.  Forrás: `phone`.
- **Sétáló vendég** — a recepciós a helyszínen rögzíti a foglalást.
  Forrás: `walk_in`.
- **Külső partner integráció** — harmadik fél (pl. aggregátor oldal)
  saját API kulccsal érkezik.  Forrás: `partner`.

Minden foglalás egy közös naptárba kerül, helyszíntől függetlenül.

---

## Vendég oldali funkciók

### Foglalási űrlap (embed)

- Helyszín kiválasztása (több helyszín esetén).
- Dátum, létszám, időpont megadása.
- Csak ténylegesen szabad időpontok jelennek meg.
- Kapcsolati adatok megadása (név, email, telefon, megjegyzés).
- Mobil, tablet, asztali gép — minden eszközre optimalizált.
- Magyar és angol nyelv.
- Ország-előhívó választó a telefonszámhoz (külföldi vendégeknek).
- Honeypot védelem botok ellen.

### Foglalási válasz típusai

- **Visszaigazolt** — automatikusan asztalt kap.
- **Kézi felülvizsgálatra váró** — ha az időpont telt vagy a feltétel
  nem fér, „Köszönjük a foglalási igényét, hamarosan visszaigazoljuk”
  email megy ki.

### Email visszaigazolás

- A foglalás rögzítése után pár másodperccel megérkezik.
- Helyszín neve, logója (ha be van állítva).
- Dátum, időpont, létszám.
- A vendég saját adatai (név, email, telefon).
- A helyszín lemondási telefonszáma.
- Cím, weboldal, válasz email.
- Magyar és angol szekció.

### SMS visszaigazolás

- Akkor megy ki, ha a vendégnek csak telefonszáma van vagy SMS-t
  választott.
- Egy szegmensbe (160 karakter) belefér — minimális költség.
- Tartalmazza a helyszínt, dátumot, időpontot, létszámot,
  lemondási számot.

### Emlékeztető

- A foglalás kezdete előtt ~2 órával automatikusan kimegy.
- Ugyanazon a csatornán, mint a visszaigazolás (email vagy SMS).
- Egy foglaláshoz egy emlékeztető megy ki — duplázás kizárva.

### Lemondás értesítés

- Ha a recepciós lemondja a foglalást, a vendég azonnal kap értesítést.
- Az eredetileg választott csatornán.

### Módosítás értesítés

- Ha a foglalás dátuma, időpontja vagy létszáma változik, a vendég
  „Foglalása módosítva és megerősítve” emailt vagy SMS-t kap.
- Tartalmazza az új részleteket.

---

## Recepciós (support) funkciók

### Foglalási idővonal

- Vizuális napi áttekintés egy helyszínre vagy az egész láncra.
- Minden asztal egy sorban, óránkénti bontás.
- Foglalások színesen jelölve a státusz szerint.
- Üzenettel rendelkező foglalások jelzéssel ellátva.
- Foglalásra koppintva részletek megnyithatók.

### Foglalások listája

- Szűrhető helyszín, státusz, dátum, forrás szerint.
- Vendég neve, dátum, időpont, létszám, asztalok, státusz.
- Üzenet ikon, ha a vendég megjegyzést hagyott.
- Részletes nézethez koppintással.

### Új foglalás létrehozása

- Helyszín, dátum, időpont, létszám, vendég adatok megadása.
- Forrás megjelölése (web — embed, telefon, walk-in, admin, partner).
- Asztaltípus választás (ha van).
- Értesítési csatorna választása (email / SMS / nincs).

### Ellenőrzött foglalás (telefonos workflow)

- Külön oldal a telefonos foglalások gyors kezelésére.
- Helyszín, dátum, időpont, létszám megadása.
- „Ellenőrzés” gomb azonnal megmutatja a szabad asztalokat.
- Ha a kért időpontban nincs hely, automatikusan felajánlja:
  - **Más időpontot** ugyanazon a napon (±3 óra ablak).
  - **Más helyszínt** ugyanabban a csoportban.
- Egy radio-választás után vendég adatok megadása.
- Egy kattintással véglegesítés — visszaigazolás azonnal megy.

### Foglalás szerkesztése

- Dátum, időpont, létszám, vendég adatok módosítása.
- Külön szerkeszthető a megjegyzés és a belső jegyzet.
- Ha az időpont/létszám változik, „Ellenőrzés” gomb jelenik meg:
  - Ha van hely az új feltételekre → mentés normálisan.
  - Ha nincs → mentés a kézi feldolgozási sorba.
- Asztal csere lehetőség külön gombbal.

### Foglalás státusz változtatás

- Megerősítve, lemondva, teljesítve, no-show, visszaállítás
  lemondás után.
- Lemondásnál opcionális megjegyzés, amit a belső naplóban tárolunk.

### Kézi feldolgozási sor (overflow queue)

- Minden „pending” foglalás itt jelenik meg, érkezési sorrendben.
- Vendég adatai, kért időpont, ok, helyszín láthatóak.
- „Most beférne” jelzés, ha másik foglalás lemondása miatt felszabadult
  egy hely.
- Áthelyezés (reassign) — más asztalra, más időpontra, más helyszínre.
- Lemondás külön gombbal.

### Vendégek listája

- Minden valaha foglaló vendég automatikusan rögzítve.
- Keresés név, email, telefonszám alapján.
- Foglalási előzmények, összesített statisztikák.

### Üzenet napló (notifications)

- Utóbbi 7 nap email és SMS tevékenysége.
- Címzett, időpont, csatorna, státusz, próbálkozások száma.
- Hibaüzenetek láthatók.
- Egy kattintással újrapróbálható, ha valami nem ment ki.
- Szűrhető státusz, csatorna, típus szerint.

### Statisztikák

- Foglalási mutatók egy adott időszakra.
- Forrás szerinti megoszlás (web / telefon / partner / walk-in).
- Hét napjai szerinti eloszlás.
- Napszak szerinti eloszlás.
- Foglalási előrelátás (mennyivel előre foglalnak).
- Helyszínenkénti összehasonlítás.
- Múlt + jövőbeni foglalások egyaránt szerepelnek.

---

## Helyszín kezelő (super_admin) funkciók

### Helyszínek

- Új helyszín létrehozása, név, slug, aktív/inaktív státusz.
- Helyszín csoportokba rendezhető.

### Helyszín branding

- Logó URL vagy fájl feltöltés (megjelenik az emailekben).
- Cím, telefonszám, weboldal, válasz email cím.

### Nyitva tartás

- Naponkénti nyitva tartás.
- Éjszakán átnyúló nyitva tartás kezelése.

### Asztalok

- Asztal létrehozása, szerkesztése, deaktiválása.
- Kapacitás (min/max).
- Terület (terasz, főterem, stb.).
- Asztal kombinálási csoportok.

### Asztaltípusok

- Egyedi típusok (pl. „bokszos”, „terasz”) létrehozása.
- Vendég kérheti az embeden vagy a recepciós beállíthatja.

### Foglalási beállítások

- Foglalások engedélyezése / tiltása.
- Automatikus asztal-hozzárendelés be/ki.
- Kézi sor (overflow) be/ki.
- Alapértelmezett, minimum, maximum időtartam.
- Minimum értesítési idő (mennyivel előbb foglalhat a vendég).
- Maximum előre foglalhatóság (hány nap).
- Maximum létszám egy foglalásra.
- Maximum egyidejű befogadóképesség.
- Asztalok közötti puffer idő (előtte / utána).
- Kombinálás engedélyezése.
- Csoporton átnyúló kombinálás engedélyezése.
- Más időpont javaslat engedélyezése.
- Más helyszín javaslat engedélyezése.

### Helyszín csoportok

- Több helyszínt csoportba lehet rendezni.
- Az ellenőrzött foglalás oldal a csoporton belül ajánl alternatívát.

### Felhasználók

- Új felhasználó meghívása (email cím alapján).
- Szerepkörök:
  - **super_admin** — minden hozzáférés.
  - **support** — összes helyszín foglalásait kezeli.
  - **venue_staff** — csak a saját helyszín(ei) foglalásait látja.
- Helyszín hozzárendelések kezelése venue_staff felhasználóknak.

### Engedélyezett domainek (CORS)

- Helyszínenként megadható lista, hogy melyik weboldalakról
  fogadhat foglalást az embed.

### API kulcsok

- Külső partnerek számára API kulcs generálása.
- Kulcs szintű hozzáférési listák.

### Embed analitika

- Beépített statisztika arról, hogy mely partner weboldalakon
  jelenik meg az embed.
- Form betöltések, kattintások, hibák.

### Visszaállítás

- Lemondott foglalás visszaállítható.
- Az eredeti adatok megmaradnak.

---

## Rendszer szintű funkciók

### Kettős nyelv

- Magyar és angol az egész felületen.
- Vendég-emailek mindkét nyelven.
- SMS magyar nyelven (rövid hossz miatt).

### Mobil és tablet

- Minden oldal és minden funkció működik kis képernyőn is.
- Sidebar tableten összecsukódik a több hely érdekében.
- Táblázatok kevesebb oszloppal jelennek meg telefonon.

### Újdonságok napló

- Külön gomb a fejlécben (super_admin és support látja).
- Megnyitva mutatja az utolsó fejlesztéseket.
- Új tartalomnál pulzáló jelölés a gombon.

### Cron alapú automatizmus

- Foglalások automatikus „teljesítettre” állítása lejárat után.
- Emlékeztetők kiküldése a beállított időben.
- Sikertelen email/SMS automatikus újrapróbálása exponenciális
  visszalépéssel.
- Üzenet sor (outbox) kezelése — ha valami nem ment ki, a rendszer
  újrapróbálja max. 5-ször.

### Audit napló

- Minden foglaláshoz tartozik eseménynapló (létrehozás, módosítás,
  lemondás, asztal csere, stb.).
- A részletek nézetből megtekinthető.

### Honeypot és rate limit

- Bot-szűrés rejtett mezővel.
- IP alapú korlát: max. 5 foglalás 10 perc alatt egy IP-ről.
- Email alapú korlát: max. 3 foglalás 24 óra alatt egy email címről.

---

## Értesítési csatornák

- **Email** — Resend szolgáltatóval.
- **SMS** — SeeMe.hu szolgáltatóval.
- Csatorna választás foglalásonként: a vendég aktivál egyet a
  rendelkezésre álló adatok alapján.
- Az embedről érkező foglalások mindig kapnak email visszaigazolást
  és emlékeztetőt (kötelező az email a publikus űrlapon).

---

## Megőrzött adatok

- Vendég adatai (név, email, telefon) — automatikusan deduplikálva
  email és telefonszám alapján.
- Foglalás teljes története (létrehozás, módosítások, státusz
  változások, lemondások).
- Email és SMS naplók 7 napra visszamenőleg a felületen.
- Helyszín beállítások és változások.
