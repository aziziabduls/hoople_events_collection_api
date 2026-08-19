# Admin — Hoople for Organizers

Bagian koleksi untuk **konsol penyelenggara**: satu studio atau komunitas
mengelola experience publiknya sendiri. 26 request, semuanya dibangkitkan dari
`dto/` di repositori frontend `hoople-event-admin-dashboard`.

| Folder | Sumber di `dto/` | Request |
| --- | --- | --- |
| `Auth/` | `shared/auth/` | 8 |
| `Organizer/` | `organizer/` | 17 |
| `Media/` | `shared/media/` | 1 |

---

## Cara pakai

1. **Pilih environment.** Tiga tersedia:

   | Environment | `baseUrl` |
   | --- | --- |
   | Local Host | `http://localhost:3000` |
   | Local | `https://driver-gush-blip.ngrok-free.dev` |
   | Staging | `https://api-staging.hoople.id/v1` |

   > **Hanya Staging yang memakai prefix `/v1`.** Prefix itu sudah termasuk di
   > dalam nilai `baseUrl`, jadi request tidak perlu menuliskannya. Kalau server
   > lokal ternyata juga menyajikan `/v1`, tambahkan ke `baseUrl` environment
   > yang bersangkutan — jangan ke URL request, supaya tetap satu tempat.

2. **Jalankan `Auth → Login`.** Script `after-response`-nya menyimpan
   `accessToken` dan `refreshToken` ke environment yang sedang aktif.

3. **Jalankan endpoint mana pun di `Organizer`.** Semuanya `auth: inherit` dan
   mengambil bearer token dari `Admin/folder.yml`. Tidak ada yang perlu
   menempelkan token secara manual.

4. **Kalau kena `401`,** jalankan `Auth → Refresh`; script yang sama menimpa
   token lama.

Untuk endpoint dengan path param, isi `experienceId` / `sessionId` di
environment — ambil nilainya dari `Experience List` dan `Session List`.

---

## Variabel

| Variabel | Diisi oleh | Dipakai untuk |
| --- | --- | --- |
| `baseUrl` | environment | Origin + prefix versi API |
| `accessToken` | otomatis, oleh Login / Refresh | Bearer token seluruh folder Admin |
| `refreshToken` | otomatis, oleh Login / Refresh | Body `Auth → Refresh` |
| `experienceId` | manual | `GET/PATCH/DELETE /organizer/experiences/{id}`, publish |
| `sessionId` | manual | `GET /organizer/check-in/summary?sessionId=` |

---

## Daftar endpoint

### `Auth/` — `dto/shared/auth/`

| # | Request | Method | Path | Token |
| --- | --- | --- | --- | --- |
| 1 | Register | `POST` | `/auth/register` | — |
| 2 | Login | `POST` | `/auth/login` | — |
| 3 | Refresh | `POST` | `/auth/refresh` | — |
| 4 | Me | `GET` | `/auth/me` | wajib |
| 5 | Profile Update | `PATCH` | `/auth/me` | wajib |
| 6 | Password Forgot | `POST` | `/auth/password/forgot` | — |
| 7 | Password Reset | `POST` | `/auth/password/reset` | — |
| 8 | Logout | `POST` | `/auth/logout` | wajib |

### `Organizer/` — `dto/organizer/`

| # | Request | Method | Path |
| --- | --- | --- | --- |
| 1 | Dashboard | `GET` | `/organizer/dashboard` |
| 2 | Experience List | `GET` | `/organizer/experiences?scope=` |
| 3 | Experience Detail | `GET` | `/organizer/experiences/{id}` |
| 4 | Activity Create | `POST` | `/organizer/experiences/activities` |
| 5 | Event Create | `POST` | `/organizer/experiences/events` |
| 6 | Experience Update | `PATCH` | `/organizer/experiences/{id}` |
| 7 | Experience Publish | `POST` | `/organizer/experiences/{id}/publish` |
| 8 | Experience Delete | `DELETE` | `/organizer/experiences/{id}` |
| 9 | Session List | `GET` | `/organizer/sessions` |
| 10 | Registration List | `GET` | `/organizer/registrations` |
| 11 | Checkin Scan | `POST` | `/organizer/check-in/scan` |
| 12 | Checkin Summary | `GET` | `/organizer/check-in/summary?sessionId=` |
| 13 | Analytics | `GET` | `/organizer/analytics?from=&to=` |
| 14 | Payout List | `GET` | `/organizer/payouts` |
| 15 | Transaction List | `GET` | `/organizer/transactions` |
| 16 | Settings | `GET` | `/organizer/settings` |
| 17 | Settings Update | `PATCH` | `/organizer/settings` |

Semuanya menuntut token yang `roles`-nya memuat `organizer`.

### `Media/` — `dto/shared/media/`

| # | Request | Method | Path |
| --- | --- | --- | --- |
| 1 | Upload | `POST` | `/media/upload` |

Satu-satunya endpoint `multipart/form-data`. Pilih berkas dulu di tab Body
sebelum mengirim — `value` dibiarkan kosong di YAML karena path berkas adalah
urusan masing-masing mesin.

---

## Yang ada di setiap request

- **`docs`** — tabel method/path/auth/sukses/sumber, tabel field request (tipe,
  wajib, enum yang berlaku), query param, daftar error yang mungkin, dan
  konvensi kontrak. Sumbernya disebut per berkas `dto/`, termasuk berkas contoh
  error, jadi setiap contoh bisa dilacak balik.
- **`assertions`** — `res.status < 400` dan `res.body.success == true`.
- **`tests`** — memeriksa keempat kunci envelope benar-benar ada
  (`success`, `message`, `data`, `meta`). Endpoint daftar mendapat test tambahan
  yang mencocokkan `totalPages` dengan `ceil(total / perPage)`.
- **`examples`** — response sukses yang identik dengan berkas `dto/`. Login dan
  Checkin Scan punya contoh kedua untuk jalur gagalnya (`401`, `409`).

---

## Regenerasi

Bagian ini **tidak** disunting tangan. Kalau `dto/` berubah:

```bash
node scripts/generate-admin.mjs ../../hoople-event-admin-dashboard/dto .
```

Sesuaikan path-nya dengan lokasi repositori frontend di mesin Anda. Setelah itu
`git diff` seharusnya hanya berisi perubahan yang memang berasal dari `dto/` —
kalau ada berkas lain yang berubah padahal `dto/` tidak, berarti seseorang
menyunting `Admin/` langsung.

Hanya `Admin/` yang dibangkitkan. `Client/` dan `Teams/` dipelihara manual.

---

## Catatan kontrak

Empat hal yang mudah salah, dan sudah pernah salah di versi sebelumnya:

| Hal | Benar | Salah |
| --- | --- | --- |
| Larik kartu dashboard | `statCards` | `stats` (itu selalu objek counter) |
| Irama pencairan di settings | `payout.payoutSchedule` | `payout.schedule` |
| Rincian checkout | `priceBreakdown` | `price` (itu objek uang) |
| Alamat korporat | `workEmail` | `email` (itu alamat akun Hoople) |

Dan dua yang struktural:

- **`roles` adalah array.** Satu akun bisa `["participant", "organizer",
  "teams_admin"]` sekaligus. Guard harus `roles.includes("organizer")`.
- **Satu organisasi = satu UUID**, entah muncul sebagai `community.id`,
  `host.id`, atau `workspace.id`.

`Auth/` dan `Media/` berasal dari `dto/shared/`, artinya **endpoint yang sama
juga dipakai situs peserta** (`Client/Auth`, `Client/Media`). Kontraknya satu.
Kalau salah satu sisi diubah, ubah dua-duanya — atau jangan ubah sama sekali.

Selebihnya di `dto/README.md`.
