# DOKUMEN AUDIT SISTEM SIPATEN / SHIFTTRACK
## Persiapan Penyusunan Buku Panduan Resmi Pengguna (Admin, CS, dan Security)
**Pemerintah Provinsi / Dinas Perhubungan — Sistem Informasi Pelayanan dan Tenaga Perhubungan (SIPATEN)**  
*Dokumen Hasil Investigasi & Verifikasi Kode Sumber, Basis Data, dan Antarmuka Pengguna*  
*Tanggal Audit: 29 Oktober 2026 | Status: Dokumen Teknis Resmi*

---

## DAFTAR ISI
1. [Ringkasan Eksekutif & Batasan Audit](#1-ringkasan-eksekutif--batasan-audit)
2. [Inventaris Lengkap Route, Halaman, dan Hak Akses](#2-inventaris-lengkap-route-halaman-dan-hak-akses)
3. [Audit Fitur Administrator (Portal Admin)](#3-audit-fitur-administrator-portal-admin)
4. [Audit Fitur Cleaning Service (Portal CS)](#4-audit-fitur-cleaning-service-portal-cs)
5. [Audit Fitur Security / Keamanan (Portal Security)](#5-audit-fitur-security--keamanan-portal-security)
6. [Audit Integrasi Backend, Database, Storage, dan Keamanan](#6-audit-integrasi-backend-database-storage-dan-keamanan)
7. [Matriks Status Verifikasi Fitur](#7-matriks-status-verifikasi-fitur)
8. [Temuan Bug, Diskrepansi, dan Inkonsistensi Sistem](#8-temuan-bug-diskrepansi-dan-inkonsistensi-sistem)
9. [Inventaris & Checklist Screenshot Asli untuk Buku Panduan](#9-inventaris--checklist-screenshot-asli-untuk-buku-panduan)
10. [Daftar Konfirmasi Stakeholder Sebelum Penyusunan Buku Panduan Final](#10-daftar-konfirmasi-stakeholder-sebelum-penyusunan-buku-panduan-final)

---

## 1. RINGKASAN EKSEKUTIF & BATASAN AUDIT

### 1.1 Identitas dan Tujuan Sistem
Aplikasi resmi bernama **SIPATEN** (*Sistem Informasi Pelayanan dan Tenaga Perhubungan*), sebelumnya dikenal dengan nama kode repositori *ShiftTrack*. Sistem ini dikembangkan untuk mencatat presensi, rotasi jadwal kerja, pemantauan lokasi berbasis geofencing GPS, dan rekapitulasi kinerja dua divisi lapangan: **Cleaning Service (CS)** dan **Security / Petugas Keamanan**, yang dikelola langsung oleh **Administrator Dinas Perhubungan**.

### 1.2 Stack Teknologi Aktual
- **Frontend Framework**: React 19.2.8 dengan Vite 8.3.0 dan TypeScript 6.0.2
- **Routing**: React Router v7.18.4 (`BrowserRouter`)
- **Styling**: Tailwind CSS v3.4.19 dengan Curated Modern Monochromatic Glassmorphism Design
- **Komponen UI**: Radix UI Primitives, Lucide React Icons (v1.57.0), Recharts (v3.10.1) untuk analitik
- **Ekspor Dokumen**: `exceljs` v4.4.0 (format XLSX terformat) dan `jspdf` v4.2.1 + `jspdf-autotable` v5.0.9 (format PDF cetak)
- **Backend & Database**: Supabase BaaS (PostgreSQL 15+, Supabase Auth GoTrue, Storage S3-compatible)
- **Serverless Compute**: 3 Supabase Edge Functions berbasis Deno (`submit-attendance`, `manage-admins`, `resolve-employee-id`)

### 1.3 Batasan dan Metodologi Audit
Audit ini dilakukan secara ketat dengan prinsip verifikasi faktual tanpa mengubah kode aplikasi, skema database, atau kebijakan RLS. Metodologi yang digunakan meliputi:
1. **Analisis Statis Kode Sumber**: Penelusuran menyeluruh seluruh file di folder `src/`, `supabase/functions/`, dan `supabase/migrations/`.
2. **Pengujian Unit Test Otomatis**: Eksekusi pengujian vitest/tsx yang tersedia di folder `tests/` (Auto-select, Security Dashboard, Recap 30 Days, Geofence, Idle Timeout, Manage Admins).
3. **Pengujian Browser Aktual**: Pengujian visual antarmuka via subagent browser pada server lokal aktif (`http://localhost:5173`) untuk halaman publik/login.
4. **Klasifikasi Fakta**: Memisahkan secara tegas antara fitur yang *sudah terverifikasi kode*, *sudah diuji browser*, *didukung unit test*, dan *memiliki indikasi diskrepansi*.

---

## 2. INVENTARIS LENGKAP ROUTE, HALAMAN, DAN HAK AKSES

Seluruh route didefinisikan secara deklaratif pada file [`src/routes/AppRouter.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/routes/AppRouter.tsx).

### 2.1 Matriks Route Terverifikasi

| Route Path | Nama Menu / Tampilan | Komponen File | Role Diizinkan | Status Verifikasi |
|---|---|---|---|:---:|
| `/` | Splash Screen SIPATEN | [`src/pages/public/SplashScreen.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/public/SplashScreen.tsx) | Publik | **Diuji di Browser** |
| `/login` | Enterprise Login Portal | [`src/pages/admin/LoginPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/LoginPage.tsx) | Publik | **Diuji di Browser** |
| `/admin/login` | Redirect to `/login` | Navigate redirect | Publik | **Terverifikasi Kode** |
| `/admin` | Dashboard Admin | [`src/pages/admin/DashboardPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/DashboardPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/employees` | Data Karyawan | [`src/pages/admin/EmployeesPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/EmployeesPage.tsx) | `admin` | **Terverifikasi Kode & Test** |
| `/admin/attendance` | Daftar Absensi | [`src/pages/admin/AttendanceListPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/AttendanceListPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/attendance/:id` | Detail & Koreksi Absensi | [`src/pages/attendance/AttendanceDetailPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/attendance/AttendanceDetailPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/attendance/detail` | Detail Presensi Terakhir | [`src/pages/attendance/AttendanceDetailPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/attendance/AttendanceDetailPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/review` | Review Absensi | [`src/pages/admin/ReviewPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/ReviewPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/reports` | Laporan / Rekap Absensi | [`src/pages/admin/AdminReportsPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/AdminReportsPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/recap` | Redirect to `/admin/reports` | [`src/pages/admin/AdminReportsPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/AdminReportsPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/recap/daily` | Rekapitulasi Harian | [`src/pages/admin/RecapDailyPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/RecapDailyPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/recap/monthly` | Rekapitulasi Bulanan | [`src/pages/admin/RecapMonthlyPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/RecapMonthlyPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/admins` | Kelola Administrator | [`src/pages/admin/ManageAdminsPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/ManageAdminsPage.tsx) | `admin` | **Terverifikasi Kode & Test** |
| `/admin/manage-admins` | Redirect to `/admin/admins` | Navigate redirect | `admin` | **Terverifikasi Kode** |
| `/admin/settings/schedule` | Pengaturan Jadwal | [`src/pages/admin/SettingsSchedulePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/SettingsSchedulePage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/settings/location` | Pengaturan Lokasi Kantor | [`src/pages/admin/SettingsLocationPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/SettingsLocationPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/audit` | Audit Log Sistem | [`src/pages/admin/AuditLogPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/AuditLogPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/admin/audit-log` | Redirect to `/admin/audit` | [`src/pages/admin/AuditLogPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/admin/AuditLogPage.tsx) | `admin` | **Terverifikasi Kode** |
| `/cs` | Beranda Cleaning Service | [`src/pages/cs/CSAttendancePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/cs/CSAttendancePage.tsx) | `CS`, `admin` | **Terverifikasi Kode & Test** |
| `/cs/history` | Riwayat Absensi CS | [`src/pages/employee/AttendanceHistoryPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/AttendanceHistoryPage.tsx) | `CS`, `admin` | **Terverifikasi Kode** |
| `/cs/schedule` | Jadwal Kerja CS | [`src/pages/employee/SchedulePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/SchedulePage.tsx) | `CS`, `admin` | **Terverifikasi Kode** |
| `/cs/reports` | Rekapitulasi Presensi CS | [`src/pages/employee/ReportsPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/ReportsPage.tsx) | `CS`, `admin` | **Terverifikasi Kode** |
| `/cs/profile` | Profil Utama CS | [`src/pages/employee/ProfilePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/ProfilePage.tsx) | `CS`, `admin` | **Terverifikasi Kode** |
| `/cs/profile/edit` | Kelola Profil & Avatar CS | [`src/pages/employee/EditProfilePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/EditProfilePage.tsx) | `CS`, `admin` | **Terverifikasi Kode** |
| `/cs/profile/security` | Ganti Kata Sandi CS | [`src/pages/employee/ChangePasswordPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/ChangePasswordPage.tsx) | `CS`, `admin` | **Terverifikasi Kode** |
| `/security` | Beranda Security | [`src/pages/security/SecurityAttendancePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/security/SecurityAttendancePage.tsx) | `Security`, `admin` | **Terverifikasi Kode & Test** |
| `/security/history` | Riwayat Absensi Security | [`src/pages/employee/AttendanceHistoryPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/AttendanceHistoryPage.tsx) | `Security`, `admin` | **Terverifikasi Kode** |
| `/security/schedule` | Jadwal Kerja Security | [`src/pages/employee/SchedulePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/SchedulePage.tsx) | `Security`, `admin` | **Terverifikasi Kode** |
| `/security/reports` | Rekapitulasi Presensi Security | [`src/pages/employee/ReportsPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/ReportsPage.tsx) | `Security`, `admin` | **Terverifikasi Kode** |
| `/security/profile` | Profil Utama Security | [`src/pages/employee/ProfilePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/ProfilePage.tsx) | `Security`, `admin` | **Terverifikasi Kode** |
| `/security/profile/edit` | Kelola Profil & Avatar Security | [`src/pages/employee/EditProfilePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/EditProfilePage.tsx) | `Security`, `admin` | **Terverifikasi Kode** |
| `/security/profile/security` | Ganti Kata Sandi Security | [`src/pages/employee/ChangePasswordPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/employee/ChangePasswordPage.tsx) | `Security`, `admin` | **Terverifikasi Kode** |
| `/absen` | Form Ambil Presensi (Kamera & GPS) | [`src/pages/attendance/TakeAttendancePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/attendance/TakeAttendancePage.tsx) | `CS`, `Security`, `admin` | **Terverifikasi Kode** |
| `/attendance/:id` | Detail Presensi Pribadi | [`src/pages/attendance/AttendanceDetailPage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/attendance/AttendanceDetailPage.tsx) | `CS`, `Security`, `admin` | **Terverifikasi Kode** |
| `/history`, `/schedule`, `/reports`, `/profile`, `/profile/edit`, `/profile/security` | Universal Direct Redirection | `UniversalRouteRedirect` | `CS`, `Security`, `admin` | **Terverifikasi Kode** |

### 2.2 Mekanisme Keamanan Sesi & Route Guard
1. **ProtectedRoute (`src/routes/ProtectedRoute.tsx`)**:
   - Jika belum login (`!isAuthenticated || !user`), otomatis redirect ke `/login` dan menyimpan state `from` (hanya untuk deep-link non-generik).
   - Jika role pengguna tidak sesuai dengan daftar `allowedRoles`, menampilkan layar blokir akses *“Akses Terbatas — Anda tidak memiliki hak akses untuk halaman ini”* disertai tombol logout dan tombol kembali.
   - Peran `admin` memiliki hak akses universal ke seluruh portal (termasuk portal simulasi CS dan Security).
2. **Idle Session Manager (`src/components/common/IdleSessionManager.tsx`)**:
   - Mencegah sesi terbengkalai pada perangkat bersama/pos jaga.
   - **Batas Waktu Idle**:
     - Administrator: **15 menit** tidak aktif (peringatan muncul di menit ke-14).
     - Cleaning Service & Security: **30 menit** tidak aktif (peringatan muncul di menit ke-29).
   - **Peringatan Hitung Mundur**: Modal `IdleWarningModal` menampilkan hitung mundur 60 detik dengan opsi *“Tetap Masuk”* atau *“Keluar Sekarang”*.
   - **Sinkronisasi Multi-Tab**: Menggunakan `BroadcastChannel('shifttrack_idle_session_channel')` dan `localStorage` agar aktivitas mouse/keyboard di satu tab mereset timer di semua tab secara instan.

---

## 3. AUDIT FITUR ADMINISTRATOR (PORTAL ADMIN)

Portal Administrator menggunakan layout terpadu [`AdminLayout.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/components/admin/AdminLayout.tsx) dengan sidebar navigasi responsif, header dengan indikator profil, dan perlindungan `beforeunload` saat form aktif.

### 3.1 Dashboard Admin (`/admin`)
- **Tujuan**: Memberikan ringkasan operasional harian secara real-time.
- **Komponen Utama**:
  1. *5 Kartu Metrik Operasional*:
     - **Total Karyawan Aktif**: Menghitung baris pada view/tabel `active_employees_directory`.
     - **Hadir Hari Ini**: Menghitung pegawai unik yang memiliki catatan `attendance_type = 'masuk'` pada tanggal kerja hari ini (`todayJakarta()`).
     - **Tepat Waktu**: Jumlah presensi masuk berstatus `tepat_waktu`.
     - **Terlambat**: Jumlah presensi masuk berstatus `terlambat`.
     - **Belum Absen Masuk**: Selisih total karyawan aktif dikurangi pegawai yang sudah absen masuk.
  2. *Grafik Donat Komposisi Kehadiran*: Memvisualisasikan persentase Tepat Waktu (Emerald), Terlambat (Amber), dan Belum Absen (Neutral) menggunakan Recharts.
  3. *Grafik Area Tren 7 Hari*: Menampilkan fluktuasi kehadiran 7 hari ke belakang.
  4. *Tabel 8 Aktivitas Terkini*: Menampilkan presensi terbaru secara real-time dengan status badge dan tautan langsung ke detail catatan.
  5. *Tombol Ekspor Cepat*: Mengunduh rekap XLSX hari ini secara langsung dari header dashboard via `exportRecapToExcel`.
- **Sumber Data**: Tabel `attendance_records` dan `active_employees_directory`.

### 3.2 Data Karyawan (`/admin/employees`)
- **Tujuan**: Pengelolaan master data pegawai CS dan Security, penerbitan akun autentikasi, reset kata sandi, dan penonaktifan aman.
- **Alur & Tindakan Pengguna**:
  1. *Tambah Pegawai Baru (`UserPlus`)*:
     - Admin memasukkan Nama Lengkap, Divisi (`CS` atau `Security`), Shift Bawaan (khusus Security: Shift I, Shift II, atau Shift III), NIK/ID Pegawai, Email Login, dan Password Awal (min. 6 karakter).
     - Sistem menyediakan saran otomatis ID Pegawai (`CS001`, `SEC001`, dst.) melalui fungsi `generateSuggestedCode`.
     - **Penyimpanan**: Memanggil PostgreSQL RPC `admin_create_employee` yang secara atomik membuat akun di `auth.users` dan mencatat data di `employee_profiles`.
     - **Modal Kredensial Baru**: Setelah sukses, modal menampilkan ringkasan kredensial dan tombol *“Salin Kredensial”* untuk diserahkan ke pegawai.
  2. *Ubah Data Pegawai (`Edit2`)*:
     - Mengubah nama, ID pegawai, email, divisi, shift bawaan, status aktif, dan catatan khusus.
     - Setiap perubahan otomatis dicatat ke `attendance_audit_logs` dengan diff nilai lama dan baru.
  3. *Reset Kata Sandi Pegawai (`KeyRound`)*:
     - Membuka modal reset sandi tanpa perlu mengetahui sandi lama pegawai.
     - Memanggil RPC `admin_reset_employee_password(p_employee_id, p_new_password)` yang memperbarui hash sandi di GoTrue Auth.
  4. *Toggle Status Aktif/Nonaktif*:
     - Mengubah switch status aktif pegawai. Pegawai non-aktif langsung ditolak oleh Edge Function saat mencoba melakukan presensi.
  5. *Hapus Pegawai (`Trash2`)*:
     - Memanggil RPC `admin_delete_employee`.
     - **Perlindungan Riwayat**: Jika pegawai sudah memiliki riwayat presensi di `attendance_records`, akun tidak dihapus keras (hard delete) melainkan dinonaktifkan (`is_active = false`) demi menjaga integritas laporan historis.
- **Validasi Form**: Nama lengkap min 2 huruf, email valid format `@`, kata sandi minimal 6 karakter.

### 3.3 Daftar Absensi (`/admin/attendance`)
- **Tujuan**: Menampilkan seluruh transaksi presensi lapangan dengan filtering multi-kriteria dan pagination server-side.
- **Fitur Toolbar & Filter**:
  - Tombol pintas: *“Hari Ini”* dan *“Semua Tanggal”*.
  - Panel Filter Lanjutan: Rentang tanggal (`date_from` s/d `date_to`), Kategori (`CS` / `Security`), Shift (`Shift I`, `Shift II`, `Shift III`, `Sesi Pagi`, `Sesi Malam`), Tipe Presensi (`masuk`, `istirahat`, `pulang`), Status Kehadiran (`tepat_waktu`, `terlambat`), dan Status Review (`belum_diperiksa`, `perlu_tindak_lanjut`, `sudah_diperiksa`).
  - Pencarian instan berdasarkan nama pegawai (`ilike %name%`).
- **Tabel Data**: Menampilkan Waktu Server Jakarta, Pegawai & Divisi, Tipe, Status Kehadiran & Keterlambatan, Status Validasi GPS (dalam radius / di luar radius beserta jarak meter), Status Review, dan tombol detail.
- **Ekspor Excel**: Tombol *“Export Excel”* mengekspor data yang sesuai dengan filter aktif saat itu menggunakan pustaka `ExcelJS`.

### 3.4 Review & Verifikasi Absensi (`/admin/review`)
- **Tujuan**: Antarmuka khusus verifikator untuk memeriksa presensi anomali (misal: presensi di luar radius kantor dengan alasan darurat, keterlambatan signifikan, atau checkout lintas hari).
- **Struktur Tab**:
  1. *Perlu Tindak Lanjut* (Badge merah menyala dengan hitungan real-time).
  2. *Belum Diperiksa* (Badge abu-abu).
  3. *Sudah Diperiksa* (Badge hijau).
- **Modal Verifikasi Terpadu (Split Verification View)**:
  - Sisi Kiri: Menampilkan foto selfie bukti presensi yang di-load via *short-lived signed URL* (berlaku 1 jam) dari bucket privat `selfies`, peta/koordinat GPS, akurasi sinyal, dan jarak dari titik kantor resmi.
  - Sisi Kanan: Alasan yang diajukan pegawai (jika di luar radius), status saat ini, form penetapan status review (`sudah_diperiksa` atau `perlu_tindak_lanjut`), dan form Catatan Administrator.
  - **Audit Logging**: Setiap verifikasi wajib menyertakan catatan admin dan dicatat pada tabel `attendance_audit_logs`.
- **Fitur Hapus Presensi (`admin_delete_attendance`)**: Admin dapat menghapus catatan presensi palsu/duplikat dengan memasukkan alasan pembatalan resmi yang tersimpan di audit log.

### 3.5 Laporan & Rekapitulasi Presensi (`/admin/reports`)
Konsolidator laporan resmi yang memiliki tab navigasi antara Rekap Harian dan Rekap Bulanan.
1. **Rekap Harian (`/admin/recap/daily`)**:
   - Memilih tanggal evaluasi spesifik.
   - Rekap perorangan mencantumkan jam masuk, jam istirahat, jam pulang, status kedisiplinan, dan catatan verifikasi.
   - Tombol unduh **Excel (.xlsx)** via `exportDailyRecapExcel` dan **PDF (.pdf)** via `exportDailyRecapPdf`.
2. **Rekap Bulanan (`/admin/recap/monthly`)**:
   - Memilih Bulan dan Tahun dengan navigasi maju-mundur.
   - Matriks kinerja: Menghitung Total Hari Kerja Hadir, Total Masuk Tepat Waktu, Total Terlambat, Akumulasi Menit Keterlambatan, dan *Persentase Kepatuhan*.
   - Penyorot Kinerja: Widget *“Pegawai Paling Disiplin”* dan *“Pegawai Perlu Perhatian (Keterlambatan Tertinggi)”*.
   - Tombol unduh **Excel (.xlsx)** via `exportMonthlyRecapExcel` dan **PDF (.pdf)** via `exportMonthlyRecapPdf`.

### 3.6 Kelola Administrator (`/admin/admins`)
- **Tujuan**: Manajemen akun super-admin dan verifikator sistem SIPATEN.
- **Implementasi Backend**: Terintegrasi penuh dengan Supabase Edge Function `manage-admins` (Deno) dan tabel `admin_profiles`.
- **Tindakan**:
  - *Tambah Admin Baru*: Memasukkan Nama, Email, dan Password awal. Edge Function memanggil `auth.admin.createUser` dan mengisi `admin_profiles`.
  - *Ubah Nama & Email Admin*: Sinkronisasi dua arah antara tabel profil dan GoTrue Auth.
  - *Nonaktifkan/Aktifkan Akun Admin*: Mencegah login admin tanpa menghapus profilnya.
  - *Reset Password Admin*: Mengatur ulang sandi akses admin via `auth.admin.updateUserById`.
  - *Hapus Admin*: Dilengkapi pengaman ganda—sistem menolak jika admin mencoba menghapus akunnya sendiri atau mencoba menghapus admin terakhir yang tersisa di sistem.
  - *Rekonsiliasi Akun (`handleReconcile`)*: Menyelaraskan profil admin di database dengan akun auth yang ada di GoTrue jika terjadi inkonsistensi sinkronisasi.

### 3.7 Pengaturan Jadwal Kerja (`/admin/settings/schedule`)
- **Tujuan**: Konfigurasi parameter jam kerja resmi yang menjadi acuan validasi kedisiplinan di seluruh sistem.
- **Data Tersimpan pada `attendance_settings`**:
  - `grace_period_minutes`: Toleransi keterlambatan global (dalam menit).
  - `cs_schedule`: Parameter 3-boundary jam kerja Cleaning Service:
    - *Jam Buka Presensi Masuk (`open`)*: Default `07:30 WIB`.
    - *Batas Tepat Waktu (`ontime_deadline`)*: Default `08:00 WIB`.
    - *Tutup Jendela Masuk (`close`)*: Default `11:59 WIB`.
    - *Jam Istirahat*: `12:00 – 14:00 WIB`.
    - *Jam Pulang*: `16:00 – 18:00 WIB`.
  - `security_schedule`: Jadwal 3 shift rotasi Senin–Jumat:
    - *Shift I*: Masuk 07:00 (jendela s/d 07:30), Pulang 16:00 (jendela s/d 16:30).
    - *Shift II*: Masuk 15:00 (jendela s/d 15:30), Pulang 19:30 (jendela s/d 20:00).
    - *Shift III*: Masuk 19:30 (jendela s/d 20:00), Pulang 07:00 H+1 (jendela s/d 07:30 H+1).
    - *Pergeseran Kamis/Jumat (`thursday_friday_shift_minutes`)*: Menit pergeseran jadwal (misal senam/apel).
  - `security_weekend_schedule`: Jadwal presensi khusus akhir pekan (Sabtu & Minggu):
    - *Sesi Pagi*: Buka 08:00, Tutup jendela 08:30 WIB.
    - *Sesi Malam*: Buka 20:00, Tutup jendela 20:30 WIB (pulang 08:00 H+1).
- **Mekanisme Cache Invalidation**: Saat admin mengklik *Simpan Pengaturan*, fungsi `invalidateScheduleCache()` dipanggil untuk membersihkan in-memory cache client agar perubahan langsung dirasakan oleh seluruh pengguna tanpa restart aplikasi.

### 3.8 Pengaturan Lokasi & Geofence GPS (`/admin/settings/location`)
- **Tujuan**: Menentukan koordinat pusat kantor/pos dinas dan radius batas presensi.
- **Fitur**:
  - *Peta Interaktif (`LocationPickerMap` berbasis Leaflet)*: Admin dapat menggeser pin lokasi kantor atau mengklik titik peta untuk mendapatkan koordinat Latitude & Longitude presisi.
  - *Input Radius Geofence*: Pengaturan jarak toleransi dalam satuan meter (default 100 meter).
  - *Manajemen Preset Lokasi (`location_presets`)*: Menambah, mengubah, menghapus, atau mengaktifkan lokasi alternatif (misal: Kantor Dishub Pusat, Pos Terminal, UPT Pengujian Kendaraan Bermotor).
  - **Penyimpanan**: Disimpan di tabel `location_presets` dan disinkronkan ke `attendance_settings` (`office_coordinates` dan `office_radius_meters`).

### 3.9 Audit Log Sistem (`/admin/audit`)
- **Tujuan**: Rekam jejak seluruh aktivitas administratif penting demi akuntabilitas dan pencegahan manipulasi data.
- **Tabel Sumber**: `attendance_audit_logs` di-join dengan `admin_profiles`.
- **Kolom Tampilan**: Waktu Kejadian (Jakarta Time), Administrator Pelaksana, Jenis Tindakan (`correction`, `review_status_change`, `setting_update`, `update_employee`, dll.), Alasan/Justifikasi, dan Tombol *“Lihat Diff / JSON”*.
- **Modal Diff JSON**: Menampilkan perbandingan mendalam nilai lama (`old_values`) vs nilai baru (`new_values`).

---

## 4. AUDIT FITUR CLEANING SERVICE (PORTAL CS)

Portal CS dirancang khusus untuk pegawai kebersihan lapangan dengan antarmuka yang bersih, kontras tinggi, dan ramah sentuhan layar ponsel.

### 4.1 Login & Autentikasi CS
- Pegawai CS masuk melalui halaman login `/login`.
- Input identitas menerima:
  1. ID Pegawai (contoh: `CS001`). Sistem memetakan ID ke akun terdaftar melalui RPC `resolve_employee_identifier` atau Edge Function `resolve-employee-id`.
  2. Alamat email akun resmi (contoh: `cs001@sipaten.app`).
- Setelah login berhasil, `AuthContext` memverifikasi peran di `employee_profiles`. Jika role adalah `CS`, pengguna langsung diarahkan ke `/cs`.
- Batas idle session: **30 menit**.

### 4.2 Beranda & Dashboard CS (`/cs`)
Diimplementasikan oleh [`CSAttendancePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/cs/CSAttendancePage.tsx) yang merender [`EmployeeHomeView.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/components/employee/EmployeeHomeView.tsx) dengan properti `category="CS"`.
- **Kartu Identitas Pegawai**: Menampilkan nama lengkap, badge *Cleaning Service*, foto profil avatar (atau inisial), dan tanggal hari ini.
- **Kartu Presensi Hari Ini (`presensi-hari-ini-card`)**:
  - Menampilkan 3 pilar tahapan kerja: **Masuk**, **Istirahat**, dan **Pulang**.
  - Jam presensi tercatat atau `--:--` jika belum dilakukan.
  - Status kedisiplinan tercatat (*Tepat Waktu* atau *Terlambat*).
- **Tombol Aksi Dinamis Utama**:
  - Tombol berubah label secara kontekstual:
    - *“Ambil Foto & Absen Masuk”*: Muncul jika belum absen masuk dan jendela buka telah tiba (`>= 07:30 WIB`).
    - *“Presensi Masuk Belum Dibuka (Mulai 07.30 WIB)”*: Tombol dinonaktifkan jika waktu belum mencapai jam 07:30.
    - *“Ambil Foto & Absen Istirahat”*: Muncul setelah absen masuk, aktif saat jam istirahat.
    - *“Ambil Foto & Absen Pulang”*: Muncul saat waktu pulang telah tiba (`>= 16:00 WIB`).
    - *“Presensi Hari Ini Selesai”*: Tombol dinonaktifkan dengan tanda centang setelah absen pulang tercatat.
- **Widget Rekap 30 Hari CS**: Menampilkan Total Kehadiran, Tepat Waktu, Terlambat, dan Kehadiran Belum Lengkap.
- **Grafik Batang Mingguan CS**: Menampilkan indikator kehadiran dari Senin sampai Minggu pada minggu berjalan.

### 4.3 Alur Presensi Masuk CS (Jadwal 3-Boundary)
Aturan presensi masuk CS diverifikasi di frontend dan ditegakkan secara absolut di backend Edge Function `submit-attendance`:
1. **Sebelum Jam 07:30 WIB**:
   - Status: `WINDOW_NOT_OPEN`.
   - UI: Tombol disabled.
   - Jika dipaksa submit: Server mengembalikan error 400: *"Presensi masuk CS belum dibuka. Jendela check-in dimulai pukul 07:30 WIB."*
2. **Pukul 07:30 – 08:00 WIB**:
   - Status: `tepat_waktu`.
   - UI: Tombol aktif warna hitam. Catatan tersimpan sebagai tepat waktu tanpa menit keterlambatan.
3. **Pukul 08:01 – 11:59 WIB**:
   - Status: `terlambat`.
   - UI: Tombol aktif warna oranye/amber bertuliskan presensi terlambat.
   - Server menghitung selisih menit keterlambatan dari batas 08:00 (`late_minutes = waktu_sekarang - 08:00`) dan mencantumkan pada `admin_notes`.
4. **Setelah Pukul 11:59 WIB**:
   - Status: `WINDOW_CLOSED`.
   - Server menolak presensi dengan error 400: *"Jendela presensi masuk CS telah ditutup pada pukul 11:59 WIB. Presensi hari ini tidak dapat dilakukan."*

### 4.4 Alur Presensi Istirahat & Pulang CS
- **Istirahat**: Jadwal resmi pukul 12:00 – 14:00 WIB. Presensi istirahat tidak dihitung penalti keterlambatan, namun jika dilakukan di luar rentang jadwal, status review otomatis ditandai `perlu_tindak_lanjut` untuk verifikasi admin.
- **Pulang**: Jadwal resmi pukul 16:00 – 18:00 WIB. Presensi pulang sebelum jam 16:00 dicegah oleh sistem.

### 4.5 Alur Pengambilan Foto Selfie & Validasi GPS Geofence
Saat tombol presensi ditekan, modal [`TakeAttendanceModal.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/attendance/TakeAttendanceModal.tsx) terbuka:
1. **Pemeriksaan Izin Perangkat**: Meminta izin Kamera depan (`facingMode: 'user'`) dan izin Lokasi GPS (`navigator.geolocation`).
2. **Kalkulasi Radius Geofence (Haversine Formula)**:
   - Menghitung jarak perangkat pegawai dari koordinat kantor aktif.
   - Jika berada di dalam radius (default <= 100 meter): Pegawai mengambil foto selfie, mereview foto, dan langsung mengklik *“Kirim Presensi Sekarang”*.
   - Jika berada di luar radius kantor: Sistem menampilkan peringatan jarak (*“Anda berada X meter di luar radius kantor”*), mewajibkan pengisian **Alasan Presensi di Luar Radius (minimal 5 karakter)**, dan menandai catatan sebagai `perlu_tindak_lanjut` agar diperiksa admin.
3. **Pemeriksaan Integritas Foto (Anti-Spoofing & Magic Bytes)**:
   - Foto dikonversi ke JPEG base64 dan dikirim ke Edge Function `submit-attendance`.
   - Edge Function memeriksa byte header (*magic bytes* `FF D8 FF` untuk JPEG atau `89 50 4E 47` untuk PNG) untuk memastikan data foto asli dan bukan file executable berbahaya.
   - Ukuran foto dibatasi maksimal 5 MB.
   - Foto disimpan di bucket privat `selfies` dengan path `selfies/{category}/{YYYY-MM-DD}/{uuid}.jpg`.

### 4.6 Menu Pendukung Pegawai CS
- **Riwayat Absensi (`/cs/history`)**: Filter rentang tanggal pribadi, pencarian status, daftar kehadiran per tanggal, dan rincian jam kerja. Dilindungi isolasi data ketat (pegawai CS tidak dapat melihat data pegawai lain).
- **Jadwal Kerja (`/cs/schedule`)**: Menampilkan kartu jam kerja resmi CS (Masuk 07:30–08:00, Istirahat 12:00–14:00, Pulang 16:00–18:00).
- **Rekapitulasi Pribadi (`/cs/reports`)**: Rekapitulasi harian, mingguan, dan bulanan khusus untuk akun CS yang bersangkutan dengan opsi unduh Excel.
- **Profil & Foto Profil (`/cs/profile`, `/cs/profile/edit`)**: Menampilkan data akun, mengunggah foto profil ke bucket `avatars` (maksimal 2MB, format JPEG/PNG/WebP), atau menghapus foto profil untuk kembali ke inisial nama.
- **Ganti Kata Sandi (`/cs/profile/security`)**: Form ganti kata sandi mandiri yang memverifikasi kata sandi lama sebelum mengizinkan pembaruan kata sandi baru (minimal 6 karakter).

---

## 5. AUDIT FITUR SECURITY / KEAMANAN (PORTAL SECURITY)

Portal Security menangani pola kerja shift 24 jam rotasi non-stop dengan dukungan pergantian shift dinamis dan crossover lintas hari (overnight).

### 5.1 Login & Autentikasi Security
- Masuk melalui `/login` dengan ID Pegawai (contoh: `SEC001`) atau Email terdaftar (`sec001@sipaten.app`).
- Diarahkan ke `/security` setelah diverifikasi memiliki role `Security` di `employee_profiles`.
- Batas idle session: **30 menit**.

### 5.2 Beranda & Dashboard Security (`/security`)
Diimplementasikan oleh [`SecurityAttendancePage.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/pages/security/SecurityAttendancePage.tsx) yang memanggil [`EmployeeHomeView.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/components/employee/EmployeeHomeView.tsx) dengan `category="Security"`, merender komponen operasional khusus dari [`SecurityDashboard.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/components/employee/SecurityDashboard.tsx).
- **Kartu Status Shift Utama (`SecurityShiftStatusCard`)**:
  - Menampilkan Shift Aktif yang sedang dipilih atau bertugas.
  - Status Dini: *Belum Absen Masuk*, *Sedang Bertugas*, *Menunggu Waktu Pulang*, atau *Shift Selesai*.
  - Jam presensi masuk dan jam presensi pulang (disertai penanda `(H+1)` untuk shift malam lintas hari).
  - Tombol pemilih shift cepat (`Shift I`, `Shift II`, `Shift III` pada hari kerja; `Sesi Pagi`, `Sesi Malam` pada akhir pekan).
- **Seksi Operasional Security Tambahan**:
  - *Statistik Operasional 30 Hari*: Shift Selesai, Keterlambatan, dan Catatan Tidak Lengkap.
  - *Riwayat Sesi Shift Bertugas*: Daftar kronologis sesi dinas security yang dipasangkan antara masuk dan pulang.
  - *Informasi Jadwal Shift Hari Ini*: Kartu waktu dinas per shift.

### 5.3 Alur Modal Pemilihan Shift (`ShiftSelectionModal.tsx`)
Modal pemilihan shift dibuka saat petugas security mengklik tombol *“Pilih Shift”*, *“Ganti Shift”*, atau saat mengklik tombol utama presensi masuk.
**Aturan Pemilihan Shift Terverifikasi**:
1. **Semua Shift Bebas Dipilih**: Shift I, Shift II, dan Shift III (atau sesi akhir pekan) dapat diklik kapan saja oleh petugas.
2. **Kondisi 1: Jendela Masuk Sedang Berlangsung (Tepat Waktu)**:
   - Jika saat modal dibuka tepat satu shift sedang dalam jendela masuk, shift tersebut **otomatis terpilih (auto-select)**.
   - Kartu shift menampilkan badge hijau berdenyut *“Tepat Waktu”*.
   - Kartu penjelasan menampilkan banner hijau: *“Jendela Masuk [Shift] Sedang Aktif”*.
   - Tombol konfirmasi di footer aktif warna hitam/gelap: **“Lanjutkan ke Foto Presensi”**.
3. **Kondisi 2: Jendela Masuk Belum Dibuka**:
   - Jika petugas memilih shift yang belum waktunya dimulai (misal memilih Shift II saat jam 10:00 pagi).
   - Kartu shift menampilkan badge abu-abu: **“Jendela Belum Dibuka”**.
   - Kartu penjelasan menampilkan informasi waktu buka yang dijadwalkan.
   - **Tombol Konfirmasi Dinonaktifkan**: Tombol di footer berstatus disabled (`opacity-75`, `cursor-not-allowed`) bertuliskan: **“Jendela Belum Dibuka (Mulai HH.mm WIB)”**. Petugas tidak dapat melanjutkan ke pengambilan foto presensi lebih awal.
4. **Kondisi 3: Jendela Masuk Telah Selesai (Terlambat)**:
   - Jika petugas baru masuk setelah batas jendela check-in berakhir (misal jam 08:30 memilih Shift I).
   - Petugas **tetap diizinkan memilih shift tersebut**.
   - Kartu shift menampilkan badge amber: **“Jendela Selesai”**.
   - Kartu penjelasan menampilkan banner peringatan oranye tegas: **“Peringatan Keterlambatan: Jendela Masuk [Shift] Telah Selesai”** dan menginformasikan bahwa presensi akan dicatat terlambat.
   - Tombol konfirmasi di footer berwarna **oranye (`bg-amber-600`)** bertuliskan: **“Lanjutkan Presensi (Tercatat Terlambat)”**. Mengklik tombol ini meloloskan petugas ke modal foto dan GPS untuk mencatat absensi terlambat secara sah.

### 5.4 Penanganan Shift Malam & Crossover Tengah Malam (Shift III & Sesi Malam)
- Shift III (hari kerja) dan Sesi Malam (akhir pekan) dimulai malam hari dan berakhir keesokan harinya (H+1).
- **Penetapan Tanggal Kerja (Work Date)**:
  - Presensi Masuk malam hari (pukul 19:30–23:59 WIB) dicatat dengan `work_date` hari ini.
  - Petugas yang masuk terlambat setelah lewat tengah malam (dini hari pukul 00:00–11:59 WIB) dievaluasi melalui fungsi `determineShiftIIIWorkDate()` di frontend dan logika Edge Function di backend. Sistem secara cerdas menetapkan `work_date` ke **kemarin (H-1)**, sehingga jam masuk dini hari tersebut terhubung dengan shift malam yang semestinya dan tidak merusak presensi Shift I di pagi harinya.
- **Presensi Pulang**:
  - Presensi pulang Shift III hanya diizinkan keesokan paginya (H+1) pada jam yang ditentukan (`07:00 WIB`).
  - Edge Function mencocokkan ID catatan masuk yang belum ditutup untuk menghubungkan absensi pulang ke tanggal dinas awal.

### 5.5 Operasional Akhir Pekan (Sabtu & Minggu)
- Berdasarkan fungsi `getSecurityAvailableOptions()`, pada hari Sabtu dan Minggu aplikasi secara otomatis beralih dari format 3 shift menjadi **2 Sesi**:
  1. **Sesi Pagi**: Jendela masuk 08:00 – 08:30 WIB, jam tugas 08:00 – 20:00 WIB.
  2. **Sesi Malam**: Jendela masuk 20:00 – 20:30 WIB, jam tugas 20:00 – 08:00 WIB (H+1).
- Teks antarmuka, modal shift, dan dashboard otomatis menyesuaikan label menjadi sesi akhir pekan.

---

## 6. AUDIT INTEGRASI BACKEND, DATABASE, STORAGE, DAN KEAMANAN

### 6.1 Tabel Database Supabase Terverifikasi

| Nama Tabel / View | Tipe | Fungsi Utama dalam Sistem | Kebijakan RLS |
|---|---|---|---|
| `attendance_records` | Table | Menyimpan seluruh transaksi presensi masuk, istirahat, dan pulang beserta geotag, path selfie, status keterlambatan, dan status verifikasi admin. | RLS Aktif. Pegawai hanya dapat SELECT data pribadi (`auth_uid` / `employee_profile_id`). INSERT hanya melalui Edge Function service role. Admin memiliki hak penuh SELECT/UPDATE. |
| `employee_profiles` | Table | Master data pegawai aktif/non-aktif, role (`CS` / `Security`), NIK/kode pegawai, email login, default shift, dan URL avatar. | RLS Aktif. Pegawai dapat SELECT profil pribadi. Admin memiliki hak SELECT/INSERT/UPDATE. |
| `active_employees_directory` | View / Table | Direktori penyederhanaan data pegawai aktif untuk query agregasi statistik dashboard admin dan auth mapping. | RLS Aktif (mengikuti view permissions). |
| `admin_profiles` | Table | Master data akun administrator yang berhak mengakses dashboard `/admin`. | RLS Aktif. Hanya akun admin terverifikasi yang dapat membaca/mengubah data. |
| `attendance_settings` | Table | Penyimpanan pasangan key-value konfigurasi dinamis sistem: jam kerja CS (`cs_schedule`), jadwal Security (`security_schedule`), sesi akhir pekan (`security_weekend_schedule`), koordinat kantor (`office_coordinates`), radius meter (`office_radius_meters`), dan parameter toleransi. | RLS Aktif. Seluruh pengguna terautentikasi dapat membaca (SELECT). Hanya role admin yang dapat UPDATE. |
| `location_presets` | Table | Daftar preset lokasi kantor dan pos operasional lapangan yang dapat diaktifkan sewaktu-waktu oleh admin. | RLS Aktif. Pegawai dapat SELECT. Admin dapat INSERT/UPDATE/DELETE. |
| `attendance_audit_logs` | Table | Log jejak audit yang mencatat riwayat perubahan data presensi, penyesuaian jadwal, atau modifikasi profil pegawai oleh admin beserta diff JSON. | RLS Aktif. Read-only untuk admin, INSERT via trigger/admin logic. |

### 6.2 Supabase Storage Buckets
1. **`selfies` (Storage Privat)**:
   - Digunakan untuk menyimpan foto selfie bukti kehadiran pegawai.
   - **Tingkat Keamanan**: Bucket bersifat **Private** (bukan publik). Foto tidak dapat diakses langsung melalui URL publik sembarangan.
   - **Mekanisme Akses**: Aplikasi menggunakan *Time-Limited Signed URL* via `supabase.storage.from('selfies').createSignedUrl(path, 3600)` yang otomatis kedaluwarsa setelah 1 jam (3600 detik).
2. **`avatars` (Storage Avatar Profil)**:
   - Digunakan untuk foto profil pengguna.
   - Format didukung: JPEG, PNG, WebP (maksimal ukuran 2 MB).
   - Diunggah via hook `useProfileAvatar` dan disimpan dengan path terisolasi ID pegawai.

### 6.3 Supabase Edge Functions (Deno Runtime)
1. **`submit-attendance` ([`supabase/functions/submit-attendance/index.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/supabase/functions/submit-attendance/index.ts))**:
   - Berperan sebagai gerbang utama (source of truth) pemrosesan presensi.
   - Memvalidasi whitelist pegawai aktif di `employee_profiles`.
   - Mencegah presensi ganda pada tanggal dan tipe yang sama via `idempotency_key` dan query database.
   - Memverifikasi byte header foto selfie (*magic bytes verification*).
   - Menghitung kalkulasi keterlambatan berdasarkan waktu server zona `Asia/Jakarta`.
   - Mengunggah foto ke storage `selfies` menggunakan Service Role Key dan menyimpan record ke `attendance_records`.
2. **`manage-admins` ([`supabase/functions/manage-admins/index.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/supabase/functions/manage-admins/index.ts))**:
   - Mengelola akun GoTrue Auth untuk Administrator (create, update, toggle-status, reset-password, delete, reconcile) menggunakan API `supabase.auth.admin`.
3. **`resolve-employee-id` ([`supabase/functions/resolve-employee-id/index.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/supabase/functions/resolve-employee-id/index.ts))**:
   - Memetakan NIK / ID Karyawan menjadi email autentikasi terdaftar bagi pegawai yang login menggunakan ID alih-alih email.

### 6.4 PostgreSQL Database RPC Functions Terverifikasi
- `admin_create_employee`: Pembuatan profil pegawai dan akun auth secara atomik.
- `admin_reset_employee_password`: Mengatur ulang kata sandi pegawai.
- `admin_delete_employee`: Deaktivasi atau penghapusan pegawai dengan perlindungan relasi data.
- `admin_delete_attendance`: Pembatalan catatan presensi disertai alasan yang masuk ke audit log.
- `resolve_employee_identifier`: Fungsi SQL pemetaan ID pegawai ke email.

---

## 7. MATRIKS STATUS VERIFIKASI FITUR

Berdasarkan investigasi menyeluruh, seluruh fitur dikelompokkan ke dalam 4 kategori verifikasi:

| Fitur / Modul | Peran | Kategori Verifikasi | Bukti / Catatan Verifikasi |
|---|---|:---:|---|
| Splash Screen SIPATEN | Publik | **Diuji di Browser** | Ter-render sempurna pada `http://localhost:5173/`, logo Dishub tampil, navigasi login responsif. |
| Login Portal Multirole | Publik | **Diuji di Browser** | Ter-render pada `http://localhost:5173/login`, form card glassmorphic, input ID/Password aktif. |
| Auto-select Shift Security | Security | **Didukung Unit Test** | Lulus 27/27 tes otomatis di [`tests/shift_selection_autoselect.test.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/tests/shift_selection_autoselect.test.ts). |
| Rekap Operasional Security 30 Hari | Security | **Didukung Unit Test** | Lulus 36/36 tes otomatis di [`tests/security_dashboard.test.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/tests/security_dashboard.test.ts). |
| Hardening & Validasi Admin | Admin | **Didukung Unit Test** | Lulus tes di [`tests/manage_admins_hardening.test.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/tests/manage_admins_hardening.test.ts). |
| Idle Timeout Session Manager | Semua | **Didukung Unit Test** | Lulus tes di [`tests/idle_timeout.test.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/tests/idle_timeout.test.ts) (Admin 15 mnt, CS/Sec 30 mnt). |
| Validasi GPS Geofence Haversine | CS & Security | **Didukung Unit Test** | Lulus tes di [`tests/gps_geofence_validation.test.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/tests/gps_geofence_validation.test.ts). |
| Dashboard Metrik & Grafik Admin | Admin | **Terverifikasi Kode** | Kode `DashboardPage.tsx` lengkap dengan 5 stat cards, Recharts pie & area, query Supabase valid. |
| CRUD Data Karyawan & Akun | Admin | **Terverifikasi Kode** | Kode `EmployeesPage.tsx` terhubung ke RPC `admin_create_employee` dan audit logging. |
| Review & Verifikasi Presensi | Admin | **Terverifikasi Kode** | Kode `ReviewPage.tsx` terhubung ke signed URL storage `selfies`, status periksa, dan audit log. |
| Ekspor Laporan Excel (.xlsx) | Admin | **Terverifikasi Kode** | Modul `exportExcel.ts` terverifikasi menggunakan pustaka `exceljs` dengan pewarnaan brand. |
| Ekspor Laporan PDF (.pdf) | Admin | **Terverifikasi Kode** | Modul `exportPdf.ts` terverifikasi menggunakan `jspdf` dan `jspdf-autotable`. |
| Pengaturan Lokasi & Peta | Admin | **Terverifikasi Kode** | Kode `SettingsLocationPage.tsx` dan `LocationPickerMap.tsx` terhubung ke Leaflet & DB. |
| Pengaturan Jadwal Kerja | Admin | **Terverifikasi Kode** | Kode `SettingsSchedulePage.tsx` terhubung ke `attendance_settings` dan cache invalidator. |
| Kelola Profil & Unggah Avatar | CS & Security | **Terverifikasi Kode** | Kode `EditProfilePage.tsx` terhubung ke storage bucket `avatars` (maks 2MB, MIME validation). |
| Ganti Kata Sandi Mandiri | CS & Security | **Terverifikasi Kode** | Kode `ChangePasswordPage.tsx` memverifikasi kata sandi lama via `signInWithPassword` sebelum update. |
| Toleransi Shift III & Malam H+1 | Security | **Terverifikasi Kode & Test** | Logika crossover midnight diuji pada `scheduleEngine.ts` dan Edge Function `submit-attendance`. |

---

## 8. TEMUAN BUG, DISKREPANSI, DAN INKONSISTENSI SISTEM

Selama audit kode sumber mendalam, ditemukan beberapa diskrepansi antara tampilan UI, teks label, konfigurasi database, dan backend yang **harus diketahui dan dikonfirmasi sebelum buku panduan resmi dicetak**:

### 8.1 Diskrepansi Label Waktu Shift Security di `SecurityDashboard.tsx`
- **Temuan**:
  Pada [`src/components/employee/SecurityDashboard.tsx`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/components/employee/SecurityDashboard.tsx#L38-L46), terdapat fungsi pembantu label jam kerja:
  ```typescript
  function getShiftTimeLabel(shift: SecurityShiftOption): string {
    switch (shift) {
      case 'Shift I': return '07.00 - 16.00'
      case 'Shift II': return '16.00 - 19.30'
      case 'Shift III': return '19.30 - 07.00'
      case 'Sesi Pagi': return '08.00 - 20.00'
      case 'Sesi Malam': return '20.00 - 08.00'
      default: return ''
    }
  }
  ```
- **Ketidaksesuaian dengan Konfigurasi Database & Schedule Engine**:
  Pada `DEFAULT_SECURITY_SCHEDULE` di [`scheduleEngine.ts`](file:///d:/Users/ADVAN/AppData/Local/Programs/Antigravity%20IDE/ShiftTrack/src/lib/scheduleEngine.ts#L86-L100) dan form admin di `SettingsSchedulePage.tsx`:
  - *Shift I*: Start `07:00`, Pulang `16:00` (Durasi dinas: 9 jam = 07.00 – 16.00 WIB). Namun label di dashboard tertulis `07.00 - 15.00`.
  - *Shift II*: Start `15:00`, Pulang `19:30` (Durasi dinas: 4.5 jam = 16.00 – 19.30 WIB). Namun label di dashboard tertulis `15.00 - 20.00`.
  - *Shift III*: Start `19:30`, Pulang `07:00 H+1`. Namun label di dashboard tertulis `20.00 - 07.00`.
- **Dampak pada Buku Panduan**: Buku panduan pengguna tidak boleh mencantumkan jam operasional yang bertentangan. Perlu konfirmasi resmi apakah jam kerja resmi Dishub adalah yang ada di database settings (07:00–16:00, 15:00–19:30, 19:30–07:00) atau label di dashboard (07:00–15:00, 15:00–20:00, 20:00–07:00).

### 8.2 Jam Istirahat CS dan Fleksibilitas
- Pada `SettingsSchedulePage.tsx`, jam istirahat CS dapat diubah oleh admin (default 12:00–14:00 WIB). Namun presensi istirahat CS bersifat opsional (tidak ada penalti keterlambatan jika pegawai tidak mencatat istirahat, hanya presensi masuk yang memicu status terlambat).
- Hal ini perlu dijelaskan dalam buku panduan CS agar pegawai memahami bahwa absen istirahat berfungsi sebagai pencatatan aktivitas, bukan pemicu potongan kehadiran.

### 8.3 Ketergantungan terhadap Layanan GPS Perangkat
- Sistem menggunakan `navigator.geolocation` browser. Pada perangkat ponsel tertentu yang mengaktifkan mode hemat daya baterai ekstrim, akurasi GPS dapat melemah (`accuracy > 100 meter`) sehingga memicu dialog isian alasan di luar radius meskipun pegawai berada di kantor. Panduan harus menyertakan langkah mengaktifkan *Akurasi Tinggi (High Accuracy GPS)* pada browser ponsel.

---

## 9. INVENTARIS & CHECKLIST SCREENSHOT ASLI UNTUK BUKU PANDUAN

Buku panduan resmi mewajibkan visualisasi antarmuka asli dari sistem SIPATEN.

### 9.1 Screenshot yang Telah Berhasil Diambil Otomatis via Browser Subagent
Dokumen screenshot aktual telah tersimpan di direktori artefak sistem:
1. **SS-PUB-01 (Layar Login SIPATEN)**:
   - *File Path*: `C:\Users\ADVAN\.gemini\antigravity-ide\brain\d57f6187-1c0d-46b6-b327-13fa777814de\login_page_1793283696832.png`
   - *Isi Visual*: Menampilkan latar belakang jembatan malam beresolusi tinggi, kartu login glassmorphism di sebelah kanan, logo SIPATEN, field ID Karyawan/Email, Password, tombol *“Masuk ke Sistem”*, dan teks branding Dishub.
2. **SS-PUB-02 (Splash Screen Beranda)**:
   - *File Path*: `C:\Users\ADVAN\.gemini\antigravity-ide\brain\d57f6187-1c0d-46b6-b327-13fa777814de\splash_screen_1793283709995.png`
   - *Isi Visual*: Menampilkan logo Dishub SIPATEN, badge dinas, ilustrasi bridge, dan tombol akses login.

### 9.2 Checklist Pengambilan Screenshot Manual untuk Tahap Penyusunan Manual

Untuk halaman terautentikasi (memerlukan akun login aktif), berikut panduan rute dan langkah pengambilan screenshot asli tanpa mengubah data produksi:

| ID Screenshot | Peran Sasaran | Halaman / Fitur | Rute URL | Elemen Kunci yang Wajib Masuk Tangkapan Layar |
|---|---|---|---|---|
| `SS-ADM-01` | Admin | Dashboard Utama | `/admin` | 5 kartu metrik, Donut Chart, Grafik tren 7 hari, dan tabel Aktivitas Terkini. |
| `SS-ADM-02` | Admin | Data Karyawan | `/admin/employees` | Tabel karyawan, badge status aktif, tombol Tambah Pegawai, dan menu aksi. |
| `SS-ADM-03` | Admin | Modal Tambah Karyawan | `/admin/employees` (Klik Tambah) | Form input Nama, ID Pegawai, Email, Password awal, pilihan role CS/Security. |
| `SS-ADM-04` | Admin | Modal Kredensial Baru | `/admin/employees` (Setelah Tambah) | Tampilan kredensial akun baru dan tombol Salin Kredensial. |
| `SS-ADM-05` | Admin | Daftar Absensi Lengkap | `/admin/attendance` | Toolbar filter, rentang tanggal, status kehadiran, dan tombol Export Excel. |
| `SS-ADM-06` | Admin | Review & Verifikasi | `/admin/review` | Tab Perlu Tindak Lanjut, Belum Diperiksa, dan modal split verifikasi selfie/GPS. |
| `SS-ADM-07` | Admin | Detail Catatan Presensi | `/admin/attendance/:id` | Foto bukti kehadiran, koordinat GPS, peta lokasi, dan form koreksi data. |
| `SS-ADM-08` | Admin | Rekap Harian | `/admin/recap/daily` | Date picker, stat card hadir/terlambat, tabel nama, tombol Excel dan PDF. |
| `SS-ADM-09` | Admin | Rekap Bulanan | `/admin/recap/monthly` | Month picker, persentase disiplin, award pegawai terdisiplin, tombol unduh. |
| `SS-ADM-10` | Admin | Pengaturan Jadwal | `/admin/settings/schedule` | Form pengaturan jam buka/tutup CS, pengaturan 3 shift Security, dan sesi weekend. |
| `SS-ADM-11` | Admin | Pengaturan Lokasi Kantor | `/admin/settings/location` | Peta Leaflet, pin lokasi kantor, radius lingkaran geofence, dan preset lokasi. |
| `SS-ADM-12` | Admin | Kelola Admin | `/admin/admins` | Tabel admin terdaftar, tombol Tambah Admin, dan tombol Rekonsiliasi. |
| `SS-ADM-13` | Admin | Audit Log Sistem | `/admin/audit` | Tabel audit trail, filter tindakan, dan modal inspeksi perbandingan JSON diff. |
| `SS-CS-01` | CS | Beranda Utama CS | `/cs` | Kartu status presensi (Masuk, Istirahat, Pulang), tombol aksi utama, grafik mingguan. |
| `SS-CS-02` | CS | Kamera Presensi Masuk | `/absen` atau modal presensi | Tampilan bidikan live kamera depan, indikator GPS radius kantor, tombol jepret. |
| `SS-CS-03` | CS | Dialog Alasan Luar Radius | `/absen` (di luar radius) | Peringatan jarak dari kantor dan textarea input alasan kehadiran luar kantor. |
| `SS-CS-04` | CS | Riwayat Absensi CS | `/cs/history` | Kartu/tabel riwayat presensi harian dan status tepat waktu/terlambat. |
| `SS-CS-05` | CS | Jadwal Kerja CS | `/cs/schedule` | Tampilan kartu jadwal jam buka 07.30, batas 08.00, istirahat, dan pulang. |
| `SS-CS-06` | CS | Kelola Profil & Avatar | `/cs/profile/edit` | Preview foto profil, tombol unggah foto baru, tombol hapus foto. |
| `SS-CS-07` | CS | Ganti Kata Sandi | `/cs/profile/security` | Form sandi saat ini, sandi baru, konfirmasi sandi, dan tips keamanan. |
| `SS-SEC-01` | Security | Beranda Utama Security | `/security` | Kartu status dinas shift, indikator shift aktif, riwayat sesi tugas 30 hari. |
| `SS-SEC-02` | Security | Modal Pemilihan Shift | `/security` (Klik Pilih Shift) | Kartu pilihan Shift I, II, III (atau Sesi Akhir Pekan), status waktu, dan tombol aksi. |
| `SS-SEC-03` | Security | Peringatan Keterlambatan | `/security` (Pilih shift selesai) | Banner amber *“Peringatan Keterlambatan”* dan tombol oranye *“Lanjutkan Presensi”*. |
| `SS-SEC-04` | Security | Sesi Akhir Pekan | `/security` (Hari Sabtu/Minggu) | Tampilan pilihan Sesi Pagi dan Sesi Malam akhir pekan. |
| `SS-SEC-05` | Security | Jadwal Kerja Security | `/security/schedule` | Tampilan rincian jam dinas 3 shift dan pergeseran hari Kamis/Jumat. |
| `SS-COM-01` | Semua | Peringatan Idle Timeout | Seluruh portal (Diam 14/29 mnt) | Modal hitung mundur 60 detik sebelum auto-logout dengan tombol *Tetap Masuk*. |

---

## 10. DAFTAR KONFIRMASI STAKEHOLDER SEBELUM PENYUSUNAN BUKU PANDUAN FINAL

Sebelum file Buku Panduan Pengguna resmi dalam format PDF dan Word disusun dan diformat, poin-poin administratif dan operasional berikut perlu dikonfirmasikan kepada Admin/Pimpinan Dinas Perhubungan:

1. **Penetapan Jam Kerja Resmi Shift Security**:
   - Apakah jam kerja resmi Security yang dicantumkan dalam buku panduan adalah:
     - *Opsi A (Sesuai Database Settings)*: Shift I: 07.00–16.00 WIB, Shift II: 15.00–19.30 WIB, Shift III: 19.30–07.00 WIB.
     - *Opsi B (Sesuai Label Tampilan Dashboard)*: Shift I: 07.00–15.00 WIB, Shift II: 15.00–20.00 WIB, Shift III: 20.00–07.00 WIB.
   - *Rekomendasi*: Selaraskan label tampilan dengan database settings agar tidak membingungkan petugas saat jam presensi pulang tiba.
2. **Aturan Presensi Akhir Pekan Security**:
   - Konfirmasi apakah jam Sesi Pagi (08.00–20.00 WIB) dan Sesi Malam (20.00–08.00 WIB) sudah sesuai dengan surat keputusan dinas untuk penugasan Sabtu & Minggu.
3. **Kebijakan Alasan di Luar Radius (Geofence)**:
   - Apakah terdapat batas maksimal toleransi jarak presensi di luar radius yang masih dapat ditoleransi oleh verifikator Dishub (misal untuk tugas patroli luar / pengawalan)?
4. **Format Dokumen Panduan Akhir**:
   - Apakah buku panduan dipisah menjadi **3 Buku Terpisah** (*Buku Panduan Admin*, *Buku Panduan Petugas CS*, *Buku Panduan Petugas Security*) atau digabung menjadi **1 Buku Panduan Lengkap SIPATEN Dishub** dengan bab per peran?

---
*Laporan audit ini disimpan secara permanen di `docs/audit-fitur-sipaten.md` sebagai landasan faktual penyusunan buku panduan pengguna SIPATEN.*
