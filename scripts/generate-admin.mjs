/*
 * Regenerates the Admin/ section of this collection from the frontend's `dto/`
 * directory, so the two cannot drift apart.
 *
 * Every request body and every response example under Admin/ is copied verbatim
 * out of a dto/*.json file. Nothing there is hand-written, which means a
 * hand-edit is detectable: regenerate, and `git diff` should come back empty.
 *
 *   node scripts/generate-admin.mjs <path-to-dto> .
 *
 * <path-to-dto> is the `dto/` folder of hoople-event-admin-dashboard, e.g.
 *   node scripts/generate-admin.mjs ../../hoople-event-admin-dashboard/dto .
 *
 * Only Admin/ is generated. Client/ and Teams/ are maintained by hand.
 */
import fs from 'node:fs';
import path from 'node:path';

const DTO = process.argv[2];
const OUT = process.argv[3];
if (!DTO || !OUT) throw new Error('usage: node gen-admin.mjs <dtoDir> <brunoDir>');

const read = (p) => fs.readFileSync(path.join(DTO, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const ENUMS = json('shared/common/enums.reference.json').data;

/* ------------------------------------------------------------------ helpers */

const indent = (text, n) =>
  text.split('\n').map((l) => (l.length ? ' '.repeat(n) + l : l)).join('\n');

/* A JSON file, pretty-printed exactly as dto/ holds it, as a block scalar. */
const block = (obj, n) => indent(JSON.stringify(obj, null, 2), n);

const yamlStr = (s) => JSON.stringify(String(s));

/* Which enum a value belongs to. Only annotate when it is unambiguous, or when
   the field name names the enum outright - a guess in a contract doc is worse
   than a blank cell. */
function enumFor(field, value) {
  if (typeof value !== 'string') return null;
  if (ENUMS[field] && ENUMS[field].includes(value)) return field;
  const hits = Object.keys(ENUMS).filter((k) => ENUMS[k].includes(value));
  return hits.length === 1 ? hits[0] : null;
}

function typeOf(v) {
  if (v === null) return '—';
  if (Array.isArray(v)) return 'array';
  return typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;
}

function noteFor(key, v) {
  if (v === null) return 'selalu `null` di contoh — tipe ditentukan backend';
  const e = enumFor(key, v);
  if (e) return `enum \`${e}\`: ${ENUMS[e].map((x) => `\`${x}\``).join(', ')}`;
  if (typeof v === 'string') {
    if (/^https?:\/\//.test(v)) return 'URL';
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'email';
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return 'ISO 8601 `+07:00`';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'tanggal `YYYY-MM-DD`';
    if (/^\d{2}:\d{2}$/.test(v)) return 'jam `HH:mm`';
  }
  if (key === 'price' || key.endsWith('Price') || key === 'amount')
    return 'integer polos di request (objek uang hanya di response)';
  return '';
}

/* Flatten a request body into the doc table the collection already uses. */
function fieldRows(obj, prefix = '', out = []) {
  for (const [key, value] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${key}` : key;
    out.push({
      path: p,
      type: typeOf(value),
      required: value === null ? 'tidak' : 'ya',
      note: noteFor(key, value),
    });
    if (value && typeof value === 'object' && !Array.isArray(value)) fieldRows(value, p, out);
    else if (Array.isArray(value) && value.length && typeof value[0] === 'object' && value[0])
      fieldRows(value[0], `${p}[]`, out);
  }
  return out;
}

const CONVENTIONS = `## Konvensi yang berlaku

- **Nama field** camelCase.
- **Uang** di response berbentuk \`{ amount: integer, currency: "IDR" }\`; di request integer polos.
- **Instant** (\`createdAt\`, \`paidAt\`, \`startsAt\`, \`expiresAt\`) ISO 8601 \`+07:00\`. Jam sesi berulang tetap \`"HH:mm"\`.
- **Enum** lowercase. Label berhuruf besar adalah urusan frontend.
- **Field nullable** tetap dikirim sebagai \`null\`, jangan dihilangkan.
- **\`roles\`** adalah array — satu akun bisa \`["participant", "organizer"]\`.
- **Paginasi** \`page\` / \`perPage\`, dan \`meta\` berisi \`{ page, perPage, total, totalPages }\`.

Selengkapnya di \`dto/README.md\`.`;

const ERRORS = {
  auth: [
    ['401', 'shared/common/error-unauthorized.response.json', 'Token tidak ada atau kedaluwarsa.'],
    ['403', 'shared/common/error-forbidden.response.json', 'Akun tidak punya peran `organizer`.'],
    ['500', 'shared/common/error-server.response.json', 'Kesalahan tak terduga.'],
  ],
  validation: [
    ['422', 'shared/common/error-validation.response.json', 'Validasi gagal; pesan per field ada di `error.errors`.'],
  ],
  notFound: [
    ['404', 'shared/common/error-not-found.response.json', 'Resource tidak ada atau bukan milik workspace ini.'],
  ],
  conflict: [
    ['409', 'shared/common/error-conflict.response.json', 'Bentrok state.'],
  ],
};

function errorTable(kinds, custom = []) {
  /* Custom rows come first so they win the dedupe: a 409 on check-in has its own
     example file, and a 401 on login means bad credentials, not a stale token. */
  const rows = [...custom];
  for (const k of kinds) rows.push(...ERRORS[k]);
  const seen = new Set();
  const lines = rows
    .filter((r) => (seen.has(r[0]) ? false : seen.add(r[0])))
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([code, file, when]) => `| \`${code}\` | \`${file}\` | ${when} |`);
  return `## Error yang mungkin

| Kode | Contoh | Kapan |
| --- | --- | --- |
${lines.join('\n')}

Semua error memakai envelope yang sama ditambah blok \`error\`:

\`\`\`json
{ "success": false, "message": "…", "data": null, "meta": null,
  "error": { "code": "VALIDATION_ERROR", "errors": { "email": ["…"] } } }
\`\`\``;
}

/* ------------------------------------------------------------------- catalog */

const CAPTURE_TOKENS = `const body = res.getBody();
if (body && body.success && body.data && body.data.accessToken) {
  bru.setEnvVar("accessToken", body.data.accessToken);
  if (body.data.refreshToken) bru.setEnvVar("refreshToken", body.data.refreshToken);
  console.log("accessToken disimpan ke environment aktif");
}`;

const ENVELOPE_TEST = `test("envelope lengkap", function () {
  const body = res.getBody();
  expect(res.getStatus()).to.be.below(400);
  expect(body).to.have.property("success", true);
  expect(body).to.have.property("message");
  expect(body).to.have.property("data");
  expect(body).to.have.property("meta");
});`;

const PAGINATION_TEST = `test("meta paginasi konsisten", function () {
  const meta = res.getBody().meta;
  expect(meta).to.have.property("page");
  expect(meta).to.have.property("perPage");
  expect(meta).to.have.property("total");
  expect(meta.totalPages).to.equal(Math.ceil(meta.total / meta.perPage));
});`;

const P = {
  page: { name: 'page', value: '1', type: 'query', description: 'Nomor halaman, mulai 1. Diturunkan dari `meta`.' },
  perPage: (n) => ({ name: 'perPage', value: String(n), type: 'query', description: `Baris per halaman. Contoh dto memakai ${n}.` }),
};

const AUTH = [
  {
    file: 'Register', name: 'Register', seq: 1, method: 'POST', p: '/auth/register', auth: 'none',
    req: 'shared/auth/register.request.json', res: 'shared/auth/register.response.json', status: 201, statusText: 'Created',
    desc: 'Daftar akun baru + minat awal.', errors: ['validation', 'conflict'],
  },
  {
    file: 'Login', name: 'Login', seq: 2, method: 'POST', p: '/auth/login', auth: 'none',
    req: 'shared/auth/login.request.json', res: 'shared/auth/login.response.json',
    extra: [{ name: 'Kredensial salah', status: 401, statusText: 'Unauthorized', src: 'shared/auth/login-invalid.response.json' }],
    desc: 'Masuk, mengembalikan token. **Jalankan ini lebih dulu** — script after-response menyimpan `accessToken` ke environment aktif, dan seluruh folder Admin membacanya.',
    errors: ['validation'], capture: true,
    customErrors: [['401', 'shared/auth/login-invalid.response.json', 'Email atau password salah — lihat contoh kedua.']],
    extraDocs: `## Yang dilakukan script

Setelah response sukses, \`accessToken\` dan \`refreshToken\` ditulis ke environment
yang sedang aktif lewat \`bru.setEnvVar\`. Semua request lain di folder **Admin**
memakai \`auth: inherit\`, yang mengambil bearer token dari \`Admin/folder.yml\`
— jadi tidak ada yang perlu menempel token manual.

Akun contoh punya \`roles: ["participant", "organizer", "teams_admin"]\`. Guard
harus memakai \`roles.includes("organizer")\`, bukan \`roles === "organizer"\`.`,
  },
  {
    file: 'Refresh', name: 'Refresh', seq: 3, method: 'POST', p: '/auth/refresh', auth: 'none',
    req: 'shared/auth/refresh.request.json', res: 'shared/auth/refresh.response.json',
    desc: 'Perpanjang access token. Menyimpan token baru ke environment, seperti Login.',
    errors: ['auth', 'validation'], capture: true,
  },
  {
    file: 'Me', name: 'Me', seq: 4, method: 'GET', p: '/auth/me', auth: 'inherit',
    res: 'shared/auth/profile.response.json',
    desc: 'Profil + statistik ringkas milik akun yang sedang masuk. Berguna untuk memastikan token yang tersimpan benar-benar dipakai.',
    errors: ['auth'],
  },
  {
    file: 'Profile Update', name: 'Profile Update', seq: 5, method: 'PATCH', p: '/auth/me', auth: 'inherit',
    req: 'shared/auth/profile-update.request.json', res: 'shared/auth/profile-update.response.json',
    desc: 'Ubah profil & preferensi notifikasi.', errors: ['auth', 'validation'],
  },
  {
    file: 'Password Forgot', name: 'Password Forgot', seq: 6, method: 'POST', p: '/auth/password/forgot', auth: 'none',
    req: 'shared/auth/password-forgot.request.json', res: 'shared/auth/password-forgot.response.json',
    desc: 'Kirim tautan reset.', errors: ['validation'],
  },
  {
    file: 'Password Reset', name: 'Password Reset', seq: 7, method: 'POST', p: '/auth/password/reset', auth: 'none',
    req: 'shared/auth/password-reset.request.json', res: 'shared/auth/password-reset.response.json',
    desc: 'Set password baru dengan token dari email.', errors: ['validation'],
  },
  {
    file: 'Logout', name: 'Logout', seq: 8, method: 'POST', p: '/auth/logout', auth: 'inherit',
    res: 'shared/auth/logout.response.json',
    desc: 'Cabut refresh token.', errors: ['auth'],
  },
];

const ORGANIZER = [
  {
    file: 'Dashboard', name: 'Dashboard', seq: 1, method: 'GET', p: '/organizer/dashboard',
    res: 'organizer/dashboard.response.json',
    desc: 'Kartu statistik, sesi mendatang, registrasi terbaru, tren.',
    extraDocs: `> **\`statCards\`, bukan \`stats\`.** Larik kartu dashboard bernama \`statCards\`;
> \`stats\` selalu berarti objek counter milik entitas induknya (lihat Experience
> Detail). Keduanya sempat bernama sama dan itu memecah klien bertipe.`,
  },
  {
    file: 'Experience List', name: 'Experience List', seq: 2, method: 'GET', p: '/organizer/experiences',
    res: 'organizer/experience-list.response.json', paged: 10,
    params: [{ name: 'scope', value: 'all', type: 'query', description: 'Salah satu: all, events, activities, drafts. Menggerakkan keempat tab konsol.' }],
    desc: 'Daftar experience; `scope` menggerakkan keempat tab.',
    extraDocs: `## Dua sumbu status

Setiap experience membawa dua status yang berdiri sendiri:

- \`publishState\` — apakah peserta bisa melihatnya (\`draft\`, \`published\`, \`cancelled\`).
- \`lifecycle\` — di mana posisinya dalam hidupnya sendiri (\`upcoming\`, \`ongoing\`, \`completed\`, \`cancelled\`).

Jangan gabungkan keduanya jadi satu kolom; konsol menampilkan dua-duanya.`,
  },
  {
    file: 'Experience Detail', name: 'Experience Detail', seq: 3, method: 'GET', p: '/organizer/experiences/{{experienceId}}',
    res: 'organizer/experience-detail.response.json',
    desc: 'Detail penuh untuk mode edit builder.', errors: ['notFound'],
    vars: ['experienceId'],
  },
  {
    file: 'Activity Create', name: 'Activity Create', seq: 4, method: 'POST', p: '/organizer/experiences/activities',
    req: 'organizer/activity-create.request.json', res: 'organizer/activity-create.response.json',
    status: 201, statusText: 'Created',
    desc: 'Submit builder aktivitas (5 langkah).', errors: ['validation'],
    extraDocs: `## Alur gambar

Gambar diunggah lebih dulu lewat **Media → Upload**, yang mengembalikan \`url\`.
\`url\` itulah yang dikirim sebagai \`coverImageUrl\` dan \`gallery[]\` di sini, jadi
submit builder tetap JSON murni — tidak ada multipart di endpoint ini.

## Nama yang mudah tertukar

- \`pricing\` = langkah harga di builder (\`basePrice\`, \`defaultCapacity\`).
- \`price\` = integer polos di request; objek uang \`{ amount, currency }\` hanya di response.
- \`schedule\` = konfigurasi jadwal builder (\`operatingDays\`, \`repeatWeekly\`, …),
  bukan baris tampilan katalog (itu \`scheduleSummary\`) dan bukan susunan acara
  (itu \`rundown\`, milik event).`,
  },
  {
    file: 'Event Create', name: 'Event Create', seq: 5, method: 'POST', p: '/organizer/experiences/events',
    req: 'organizer/event-create.request.json', res: 'organizer/event-create.response.json',
    status: 201, statusText: 'Created',
    desc: 'Submit builder event (4 langkah).', errors: ['validation'],
    extraDocs: `## \`format\` menentukan field mana yang wajib

\`onsite\` butuh \`venue\`; \`online\` butuh \`onlineUrl\`; \`hybrid\` butuh keduanya.
Langkah 2 builder berubah bentuk mengikuti pilihan ini, jadi validasi backend
sebaiknya ikut bersyarat, bukan mewajibkan semuanya sekaligus.

\`rundown\` adalah susunan acara \`[{ time, label }]\` — bukan \`schedule\`.`,
  },
  {
    file: 'Experience Update', name: 'Experience Update', seq: 6, method: 'PATCH', p: '/organizer/experiences/{{experienceId}}',
    req: 'organizer/experience-update.request.json', res: null,
    desc: 'Update parsial. Kirim hanya field yang berubah.',
    errors: ['validation', 'notFound'], vars: ['experienceId'],
    extraDocs: `## Response

\`dto/\` **tidak** mendefinisikan response untuk endpoint ini, jadi tidak ada
contoh yang ditempel di sini — mengarang satu hanya akan jadi kontrak palsu.
Yang paling konsisten dengan endpoint lain: kembalikan resource yang sudah
diperbarui, bentuknya sama dengan **Experience Detail**. Mohon dikonfirmasi tim
backend, lalu tambahkan \`dto/organizer/experience-update.response.json\`.`,
  },
  {
    file: 'Experience Publish', name: 'Experience Publish', seq: 7, method: 'POST', p: '/organizer/experiences/{{experienceId}}/publish',
    res: 'organizer/experience-publish.response.json',
    desc: 'Draft → published.', errors: ['notFound', 'conflict'], vars: ['experienceId'],
    extraDocs: `> Publish terjadwal **tetap** \`draft\` sampai waktunya tiba — \`publishMode\`
> (\`now\`, \`scheduled\`, \`draft\`) yang menentukan, bukan endpoint ini dipanggil
> atau tidak.`,
  },
  {
    file: 'Experience Delete', name: 'Experience Delete', seq: 8, method: 'DELETE', p: '/organizer/experiences/{{experienceId}}',
    res: 'organizer/experience-delete.response.json',
    desc: 'Hapus (soft delete).', errors: ['notFound', 'conflict'], vars: ['experienceId'],
  },
  {
    file: 'Session List', name: 'Session List', seq: 9, method: 'GET', p: '/organizer/sessions',
    res: 'organizer/session-list.response.json', paged: 10,
    desc: 'Semua sesi lintas experience, urut tanggal.',
  },
  {
    file: 'Registration List', name: 'Registration List', seq: 10, method: 'GET', p: '/organizer/registrations',
    res: 'organizer/registration-list.response.json', paged: 10,
    desc: 'Registrasi + status bayar + kehadiran.',
    extraDocs: `## Filter

Konsol menyaring per status bayar dan per experience, tapi \`dto/\` belum
menetapkan nama parameternya, jadi tidak ada yang ditebak di sini. Yang perlu
diputuskan tim backend: \`status\`, \`experienceId\`, dan \`q\` (pencarian nama atau
email) sebagai query param.

\`dto/README.md\` §7 juga mencatat paginasi berbasis cursor sebagai kandidat
untuk daftar ini — 1.248 baris di contoh, dan bisa jauh lebih besar.`,
  },
  {
    file: 'Checkin Scan', name: 'Checkin Scan', seq: 11, method: 'POST', p: '/organizer/check-in/scan',
    req: 'organizer/checkin-scan.request.json', res: 'organizer/checkin-scan.response.json',
    extra: [{ name: 'Tiket sudah dipakai', status: 409, statusText: 'Conflict', src: 'organizer/checkin-scan-rejected.response.json' }],
    desc: 'Scan QR di pintu.', errors: ['validation'],
    customErrors: [['409', 'organizer/checkin-scan-rejected.response.json', 'Tiket sudah dipakai — lihat contoh kedua.']],
    extraDocs: `## Penolakan bukan kegagalan

\`scanResult\` boleh bernilai \`accepted\`, \`already_used\`, \`invalid\`, \`expired\`
atau \`wrong_event\`. Tiket yang sudah dipakai dijawab \`409\` dengan envelope error
penuh — lihat contoh kedua — karena petugas pintu perlu tahu bedanya antara
"gagal" dan "sudah masuk tadi".`,
  },
  {
    file: 'Checkin Summary', name: 'Checkin Summary', seq: 12, method: 'GET', p: '/organizer/check-in/summary',
    res: 'organizer/checkin-summary.response.json',
    params: [{ name: 'sessionId', value: '{{sessionId}}', type: 'query', description: 'Sesi yang sedang berjalan.' }],
    desc: 'Progres check-in sesi berjalan.', errors: ['notFound'], vars: ['sessionId'],
  },
  {
    file: 'Analytics', name: 'Analytics', seq: 13, method: 'GET', p: '/organizer/analytics',
    res: 'organizer/analytics.response.json',
    params: [
      { name: 'from', value: '2026-01-01', type: 'query', description: 'Awal periode, `YYYY-MM-DD`.' },
      { name: 'to', value: '2026-03-14', type: 'query', description: 'Akhir periode, `YYYY-MM-DD`.' },
    ],
    desc: 'Ringkasan, tren bulanan, top experience, sumber trafik.',
    extraDocs: `> \`summary\` di sini sengaja **tidak** sama dengan \`summary\` di analitik konsol
> lain. Keduanya berarti "ringkasan analitik konsol ini" dan metriknya memang
> berlainan. Jangan bikin satu tipe \`Summary\` global.`,
  },
  {
    file: 'Payout List', name: 'Payout List', seq: 14, method: 'GET', p: '/organizer/payouts',
    res: 'organizer/payout-list.response.json', paged: 10,
    desc: 'Pencairan + rincian potongan.',
    extraDocs: `## Fee

3% platform + 1,8% gateway, dihitung terhadap \`gross\`. Satu baris contoh
berstatus \`on_hold\` lengkap dengan \`holdReason\`, supaya UI tidak berasumsi
pencairan selalu mulus.`,
  },
  {
    file: 'Transaction List', name: 'Transaction List', seq: 15, method: 'GET', p: '/organizer/transactions',
    res: 'organizer/transaction-list.response.json', paged: 20,
    desc: 'Buku transaksi: `sale`, `refund`, `payout`, `adjustment`.',
    extraDocs: `> Nilai **negatif** memang ada — refund dan payout — jadi jangan pasang
> \`min: 0\` pada kolom jumlah.`,
  },
  {
    file: 'Settings', name: 'Settings', seq: 16, method: 'GET', p: '/organizer/settings',
    res: 'organizer/settings.response.json',
    desc: 'Workspace, rekening, fee, paket, notifikasi.',
  },
  {
    file: 'Settings Update', name: 'Settings Update', seq: 17, method: 'PATCH', p: '/organizer/settings',
    req: 'organizer/settings-update.request.json', res: null,
    desc: 'Simpan pengaturan.', errors: ['validation'],
    extraDocs: `> **\`payout.payoutSchedule\`, bukan \`payout.schedule\`.** \`schedule\` sudah
> berarti konfigurasi jadwal di builder, jadi irama pencairan diberi nama
> sendiri. Versi lama koleksi ini masih memakai \`schedule\` — itu salah.

## Response

Sama seperti Experience Update, \`dto/\` belum mendefinisikan response-nya.
Kembalikan objek settings yang sudah diperbarui (bentuk **Settings**) dan
tambahkan \`dto/organizer/settings-update.response.json\`.`,
  },
];

const MEDIA = [
  {
    file: 'Upload', name: 'Upload', seq: 1, method: 'POST', p: '/media/upload',
    res: 'shared/media/upload.response.json', multipart: true,
    desc: 'Unggah gambar (cover, galeri, logo, avatar). Mengembalikan `url` yang dipakai payload builder.',
    errors: ['validation'],
    extraDocs: `## Ini satu-satunya endpoint non-JSON

Body-nya \`multipart/form-data\`. Field berkasnya bernama \`file\`, dengan
\`purpose\` opsional (\`cover\`, \`gallery\`, \`logo\`, \`avatar\`) supaya backend bisa
menentukan batas ukuran dan rasio. Karena itu \`dto/\` tidak punya
\`upload.request.json\` — request-nya tidak bisa diwakili JSON, hanya
response-nya.

**Pilih berkas dulu** di tab Body sebelum mengirim; \`value\` di YAML sengaja
dibiarkan kosong karena path berkas itu urusan masing-masing mesin.

Alurnya: unggah → dapat \`url\` → kirim \`url\` sebagai \`coverImageUrl\` /
\`gallery[]\` saat submit builder.`,
  },
];

/* --------------------------------------------------------------- yaml output */

function requestYaml(r) {
  const L = [];
  L.push('info:');
  L.push(`  name: ${r.name}`);
  L.push('  type: http');
  L.push(`  seq: ${r.seq}`);
  L.push('');
  L.push('http:');
  L.push(`  method: ${r.method}`);
  L.push(`  url: ${yamlStr('{{baseUrl}}' + r.p + (r.query || ''))}`);
  L.push(`  auth: ${r.auth || 'inherit'}`);

  const params = [...(r.params || [])];
  if (r.paged) params.push(P.page, P.perPage(r.paged));
  if (params.length) {
    L.push('  params:');
    for (const p of params) {
      L.push(`    - name: ${p.name}`);
      L.push(`      value: ${yamlStr(p.value)}`);
      L.push(`      type: ${p.type}`);
      L.push(`      description: ${yamlStr(p.description)}`);
    }
  }

  if (r.multipart) {
    L.push('  headers:');
    L.push('    - name: Content-Type');
    L.push('      value: multipart/form-data');
    L.push('  body:');
    L.push('    type: multipart-form');
    L.push('    data:');
    L.push('      - name: file');
    L.push('        type: file');
    L.push('        value: []');
    L.push('      - name: purpose');
    L.push('        type: text');
    L.push('        value: cover');
  } else if (r.req) {
    L.push('  headers:');
    L.push('    - name: Content-Type');
    L.push('      value: application/json');
    L.push('  body:');
    L.push('    type: json');
    L.push('    data: |-');
    L.push(block(json(r.req), 6));
  }

  L.push('');
  L.push('runtime:');
  L.push('  assertions:');
  L.push('    - expression: res.status');
  L.push('      operator: lt');
  L.push('      value: "400"');
  L.push('    - expression: res.body.success');
  L.push('      operator: eq');
  L.push('      value: "true"');
  L.push('  scripts:');
  if (r.capture) {
    L.push('    - type: after-response');
    L.push('      code: |-');
    L.push(indent(CAPTURE_TOKENS, 8));
  }
  L.push('    - type: tests');
  L.push('      code: |-');
  L.push(indent(ENVELOPE_TEST + (r.paged ? '\n\n' + PAGINATION_TEST : ''), 8));

  /* ---- docs ---- */
  const d = [];
  d.push(`# ${r.name}`);
  d.push('');
  d.push(r.desc);
  d.push('');
  d.push('| | |');
  d.push('| --- | --- |');
  d.push(`| **Method** | \`${r.method}\` |`);
  d.push(`| **Path** | \`${r.p}\` |`);
  d.push(`| **Auth** | ${r.auth === 'none' ? 'Tidak perlu token' : 'Wajib — `Authorization: Bearer <accessToken>`'} |`);
  d.push(`| **Sukses** | \`${r.status || 200} ${r.statusText || 'OK'}\` |`);
  /* Name every dto file this request stands for, error variants included -
     an example nobody can trace back to a source is not documentation. */
  const srcList = [r.req, r.res, ...(r.extra || []).map((e) => e.src)].filter(Boolean);
  d.push(`| **Sumber** | ${srcList.map((x) => `\`dto/${x}\``).join('<br>') || '— (belum ada di `dto/`)'} |`);
  d.push('');

  if (r.vars && r.vars.length) {
    d.push('## Variabel yang dipakai');
    d.push('');
    d.push('| Variabel | Untuk |');
    d.push('| --- | --- |');
    for (const v of r.vars) {
      d.push(`| \`{{${v}}}\` | ${v === 'experienceId' ? 'UUID experience — ambil dari **Experience List**' : 'UUID sesi — ambil dari **Session List**'} |`);
    }
    d.push('');
    d.push('Keduanya diisi di environment, bukan ditulis langsung di URL, supaya');
    d.push('pindah environment tidak berarti menyunting request.');
    d.push('');
  }

  const allParams = params;
  if (allParams.length) {
    d.push('## Query parameter');
    d.push('');
    d.push('| Parameter | Contoh | Catatan |');
    d.push('| --- | --- | --- |');
    for (const p of allParams) d.push(`| \`${p.name}\` | \`${p.value}\` | ${p.description} |`);
    d.push('');
  }

  if (r.req) {
    d.push('## Request body');
    d.push('');
    d.push('`application/json`');
    d.push('');
    d.push('| Field | Tipe | Wajib | Catatan |');
    d.push('| --- | --- | --- | --- |');
    for (const row of fieldRows(json(r.req)))
      d.push(`| \`${row.path}\` | ${row.type} | ${row.required} | ${row.note} |`);
    d.push('');
    d.push('> Kolom **Wajib** diturunkan dari contoh: field yang bernilai `null`');
    d.push('> dianggap opsional. Aturan validasi sesungguhnya ditentukan backend.');
    d.push('');
  }

  if (r.extraDocs) { d.push(r.extraDocs); d.push(''); }

  d.push(errorTable(
    ['auth', ...(r.errors || [])].filter((k) => !(r.auth === 'none' && k === 'auth')),
    r.customErrors || [],
  ));
  d.push('');
  d.push(CONVENTIONS);

  L.push('');
  L.push('docs: |-');
  L.push(indent(d.join('\n'), 2));

  L.push('');
  L.push('settings:');
  L.push('  encodeUrl: true');
  L.push('  timeout: 0');
  L.push('  followRedirects: true');
  L.push('  maxRedirects: 5');

  /* ---- examples ---- */
  const examples = [];
  if (r.res) examples.push({ name: 'Sukses', status: r.status || 200, statusText: r.statusText || 'OK', src: r.res });
  for (const e of r.extra || []) examples.push(e);
  if (examples.length) {
    L.push('');
    L.push('examples:');
    for (const e of examples) {
      L.push(`  - name: ${yamlStr(e.name)}`);
      L.push('    response:');
      L.push(`      status: ${e.status}`);
      L.push(`      statusText: ${e.statusText}`);
      L.push('      headers:');
      L.push('        - name: Content-Type');
      L.push('          value: application/json');
      L.push('      body:');
      L.push('        type: json');
      L.push('        data: |-');
      L.push(block(json(e.src), 10));
    }
  }

  return L.join('\n') + '\n';
}

/* ------------------------------------------------------------------- writing */

function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return rel;
}

const written = [];

for (const [dir, list, seq, blurb] of [
  ['Admin/Auth', AUTH, 1, 'Autentikasi bersama (`dto/shared/auth/`). Jalankan **Login** lebih dulu: token-nya tersimpan ke environment dan dipakai seluruh folder Admin.'],
  ['Admin/Organizer', ORGANIZER, 2, 'Konsol penyelenggara (`dto/organizer/`). Semua endpoint berawalan `/organizer/` dan menuntut token dengan peran `organizer`.'],
  ['Admin/Media', MEDIA, 3, 'Unggah berkas bersama (`dto/shared/media/`). Satu-satunya endpoint `multipart/form-data`.'],
]) {
  written.push(write(`${dir}/folder.yml`, `info:\n  name: ${dir.split('/')[1]}\n  seq: ${seq}\n\ndocs: |-\n${indent('# ' + dir.split('/')[1] + '\n\n' + blurb, 2)}\n`));
  for (const r of list) written.push(write(`${dir}/${r.file}.yml`, requestYaml(r)));
}

console.log(written.length + ' berkas ditulis:');
for (const w of written) console.log('  ' + w);
