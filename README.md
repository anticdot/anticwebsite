# Antic — Vercel-Projekt

Antic ist eine frameworkfreie Web-App: statische HTML-Seiten, getrennte CSS- und JavaScript-Dateien sowie eine native Vercel-Function unter `api/`. PostgreSQL wird über den Neon Serverless Driver angesprochen. Es gibt keine SQLite-Datei und keinen lokalen Dateispeicher im Deploy-Projekt.

## Vercel und PostgreSQL einrichten

1. Lade den Inhalt dieses Ordners in ein eigenes Git-Repository und importiere es in Vercel. Das Projektverzeichnis ist die Projektwurzel; Build Command und Output-Verzeichnis bleiben leer bzw. auf Vercel-Standard.
2. Erstelle über den Vercel Marketplace eine Neon-PostgreSQL-Datenbank und verbinde sie mit dem Projekt. Vercel stellt dabei `DATABASE_URL` als Umgebungsvariable bereit.
3. Öffne die Neon SQL-Konsole und führe den gesamten Inhalt von `database/schema.sql` einmal aus. Die Gruppe „Antic Community“ wird beim ersten erfolgreichen Konto automatisch angelegt.
4. Ergänze in Vercel → Project Settings → Environment Variables:
   - `OWNER_USERNAME`: Owner-Anzeigename (der bisherige Prototyp verwendete `r7cep`)
   - `OWNER_KEY`: dein privater zusätzlicher Owner-Schlüssel
   - `SESSION_SECRET`: zufälliger geheimer Wert mit mindestens 32 Zeichen
5. Setze Variablen für Production und Preview, wenn beide Umgebungen genutzt werden, und starte einen neuen Deploy. `DATABASE_URL` muss in denselben Umgebungen verfügbar sein.
6. Öffne `https://<dein-projekt>.vercel.app`. Beim ersten Aufruf kannst du ein Konto anlegen. Für den Namen aus `OWNER_USERNAME` ist zusätzlich `OWNER_KEY` erforderlich.

Secrets können beispielsweise lokal mit Node erzeugt werden:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Führe den Befehl jeweils separat aus, um `OWNER_KEY` und `SESSION_SECRET` zu erzeugen. Trage echte Werte nur in Vercel oder in eine nicht versionierte `.env.local` ein, nie in Git oder Quellcode.

## Lokal über Vercel testen

Installiere Node.js, installiere Vercel CLI (`npm i -g vercel`), verknüpfe das Projekt mit `vercel link` und lade Variablen mit `vercel env pull .env.local`. Danach kannst du `vercel dev` im Projektordner starten. `.env.local` ist durch `.gitignore` ausgeschlossen. Der lokale SQLite-Prototyp und dessen Daten werden von dieser Version nicht verwendet.

## Was gespeichert wird

- Konto: Anzeigename, normalisierter Anzeigename und ein PBKDF2-Passwort-Hash samt zufälligem Salt; Passwörter werden nicht gespeichert.
- App-Inhalte: Gruppen, Mitgliedschaften, Nachrichten und hochgeladene Dokumente in PostgreSQL.
- Anmeldung: signiertes, HttpOnly-Cookie mit 14 Tagen Laufzeit.
- Dokumente: erlaubte Office-/Text-/PDF-Endungen bis 3 MB, als PostgreSQL-`BYTEA`; vor jedem Download wird die Bestätigung angezeigt.

Die Anmeldung fordert keine E-Mail-Adresse oder Klardaten. Eine Garantie „100 % anonym“ wäre trotzdem falsch: Vercel, Neon, Netzwerkbetreiber oder der Browser können technisch notwendige Verbindungsdaten verarbeiten. Antic bindet keine Analyse- oder Werbedienste ein. Prüfe vor öffentlichem Betrieb Aufbewahrungsfristen, Backups, Zugangsschutz und die für deinen Einsatz nötigen Datenschutzinformationen. Große Dateien sollten später in privaten Objektspeicher wie Vercel Blob ausgelagert werden; Vercel Functions haben ein Request-Limit von 4,5 MB.

## Struktur

```text
api/index.js             API, Authentifizierung und Datenzugriff
assets/                  Logo
css/site.css             Landingpage
css/chat.css             Gruppenoberfläche
database/schema.sql      PostgreSQL-Tabellen und Indizes
js/chat.js               UI, Gruppen, Nachrichten, Upload/Download
index.html               Homepage
chat.html                Gruppenchat
vercel.json              Sicherheitsheader
```

Die einzige Laufzeit-Abhängigkeit ist `@neondatabase/serverless`; ein Frontend- oder Server-Framework ist nicht enthalten.
