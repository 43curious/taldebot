# TaldeBot

Irakasleentzako tresna: klaseetako ikasleak kudeatzeko, proiektuen inkestak jarraitzeko eta taldeak osatzeko. Astro SSR, React, Tailwind, Drizzle eta LibSQL erabiltzen ditu; argitalpena Netlify-n egiten da.

## Tokiko konfigurazioa

Node **22.12 edo berriagoa** eta npm behar dira. Ez da Turso konturik behar tokian lan egiteko.

```sh
npm ci
cp .env.example .env
npm run db:migrate -- --local
```

Jarri `INITIAL_ADMIN_PASSWORD` `.env` fitxategian eta sortu lehen administratzailea:

```sh
npm run db:admin -- --local
npm run dev
```

Ireki `http://localhost:4321/admin/login`. Erabiltzailea `admin` da, `INITIAL_ADMIN_USERNAME` aldatu ezean. Kontua badago, komandoak ez du pasahitza aldatzen. Pasahitza berrezartzeko, ezarri balio berria `.env` fitxategian eta exekutatu:

```sh
npm run db:admin -- --local --reset-password
```

Datu sintetikoak aukeran:

```sh
npm run db:seed -- --local
```

Demo proiektuaren kodea `1234D` da. Komandoak ez du urruneko datu-baserik aldatzen, eta berriro exekutatzean dagoen demoa mantentzen du.

## Komandoak eta konfigurazioa

CLI komandoek `.env` irakurtzen dute. Astro-k garapenean `.env` kargatzen du; argitaratutako aplikazioak zerbitzariaren ingurune-aldagaiak erabiltzen ditu. Ikusi [.env.example](.env.example).

| Komandoa                                       | Helburua eta baldintzak                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                  | Astro garapen-zerbitzaria; tokiko DB erabiltzen du Turso konfiguraziorik gabe.                                                 |
| `npm run db:migrate -- --local`                | Eskema osoa sortu edo eguneratu; `LOCAL_DATABASE_URL` (`file:sqlite.db` lehenetsita). Migrazio aplikatuak erregistratzen ditu. |
| `npm run db:migrate -- --remote`               | Turso eguneratu; `TURSO_CONNECTION_URL` eta `TURSO_AUTH_TOKEN` derrigorrezkoak. Egin babeskopia lehenago.                      |
| `npm run db:admin -- --local`                  | Lehen master kontua sortu; `INITIAL_ADMIN_PASSWORD` behar du. `--remote` ere onartzen du.                                      |
| `npm run db:admin -- --local --reset-password` | Dagoen kontuaren pasahitza berrezarri; ez du rola aldatzen.                                                                    |
| `npm run db:seed -- --local`                   | Aukerako demoa; migrazioak lehenago aplikatu.                                                                                  |
| `npm run db:generate`                          | `db/schema.ts`-ren aldaketetatik SQL migrazioa sortu; ez da DB batera konektatzen. Berrikusi SQL-a aplikatu aurretik.          |
| `npm run check`                                | TypeScript eta Astro txantiloien egiaztapena.                                                                                  |
| `npm test`                                     | Vitest; datu-base eta zerbitzari probek aldi baterako datu sintetikoak erabiltzen dituzte.                                     |
| `npm run build`                                | Netlify-rako SSR aplikazioa eraiki.                                                                                            |
| `npm run benchmark:data`                       | Aldi baterako DB batean jatorrizko eta egungo datu-karga alderatu.                                                             |
| `npm run benchmark:remote -- --remote --class 2 --samples 20` | Urruneko irakurketa-latentzia neurtu, datuak aldatu gabe; Turso konfigurazioa behar du. |
| `npm run benchmark:startup` | `npm run build` ondoren, Netlify build-aren abiaraztea prozesu berrietan neurtu. |
| `npm run format -- path/to/file`               | Prettier-en konbentzioa aplikatu. Formatu-aldaketa masiboak aparte egin.                                                       |

`--local` komandoek beti tokiko fitxategia erabiltzen dute, Turso kredentzialak egonda ere. `--remote` ez da inoiz automatikoki aukeratzen. Komando okerrek edo huts egindako idazketek irteera-kode ez-zeroa ematen dute. Pasahitzak ez dira inprimatzen.

SMTP aukerakoa da: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. Hostik gabe, jakinarazpenak tokian simulatzen dira. Argitaratzean bete SMTP konfigurazioa mezu errealak bidaltzeko.

## Dauden instalazioak eta argitalpena

Ez ezabatu zure `sqlite.db`: jada ez da versionatzen, baina tokiko kopia mantentzen da. Lehen migrazioak aurreko instalazio ezagunak hartzen ditu, klaseak eta proiektuen loturak gordez. Bertsio-zutaberik ez zuten taldeak bakarrik markatzen ditu `v1` gisa; dauden `v2` taldeak mantentzen ditu. Eskema ezezagunen aurrean huts egiten du, aldaketak deseginez. Xehetasunak: [arkitektura eta migrazioak](docs/architecture.md).

Netlify-k `npm run build` exekutatzen du. Konfiguratu Turso-ren bi aldagaiak Netlify-n eta aplikatu migrazioak argitaratu **aurretik**. Produkzioan DB konfigurazio faltak errorea eragiten du; ez du tokiko DB huts batera jotzen. Ez dira migrazioak automatikoki exekutatzen eskaeretan edo build-ean.

Saioak 8 ordukoak dira: tokian `.astro/sessions`, Netlify-n Blobs. Cookie zaharrak (`admin_session`) ez dira onartzen; berriro hasi saioa.

## Egiaztatu eta versionatu

```sh
npm run check
npm test
npm run build
```

[CI-k](.github/workflows/check.yml) komando berdinak exekutatzen ditu, DB sintetiko batekin eta Turso/SMTP kredentzialik gabe. `sqlite.db`, bere sidecar-ak, `.env*`, `.astro/`, `.netlify/`, `dist/` eta `node_modules/` sortutako edo tokiko fitxategiak dira. Versionatu iturri-kodea, `package-lock.json`, `.env.example` eta `db/migrations/`-eko SQL/snapshot/journal fitxategiak. Ez aldatu jada aplikatutako migrazioak.

## Dokumentazioa

- [Irakaslearen gida](docs/teacher-guide.md): klaseak, inkestak, taldeak eta esportazioak.
- [Arkitektura](docs/architecture.md): moduluak, datuak, saioak eta migrazioak.
- [Garapen-irizpideak](AGENTS.md): diseinua eta inplementazioa.
- [Cleanup neurketak](docs/cleanup-measurements.md).
- [Karga eta abiarazte neurketak](docs/loading-measurements.md).

Etengabeko jarraipenak ikaslearen identitatea, matrikulak, datatutako autoebaluazioak eta hobespenak proiektuetatik bereizten ditu. Taldeen historia berretsitako esleipenetatik bakarrik eraikitzen da. Ikusi [jarraipena, baimenak eta migrazioa](docs/student-tracking.md); eguneratu DB eta esleitu irakasleen egungo gradu/klaseko baimenak master kontuarekin.
