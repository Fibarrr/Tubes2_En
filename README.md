# Tubes2_En
> Pemanfaatan Algoritma BFS dan DFS dalam Mekanisme Penelusuran CSS pada Pohon Document Object Model
> 
> IF2211 Strategi Algoritma — Semester II 2025/2026

---

## Deskripsi Singkat

Aplikasi web untuk menelusuri struktur DOM (Document Object Model) dari sebuah halaman HTML menggunakan algoritma **Breadth First Search (BFS)** dan **Depth First Search (DFS)**, dengan pencarian elemen berdasarkan **CSS Selector**.

### Algoritma BFS
BFS menelusuri pohon DOM level per level menggunakan struktur data **queue**. Dimulai dari root (`<html>`), semua node pada kedalaman yang sama dikunjungi terlebih dahulu sebelum turun ke level berikutnya. Cocok untuk menemukan elemen yang berada dekat dengan root.

### Algoritma DFS
DFS menelusuri pohon DOM sedalam mungkin ke satu cabang sebelum backtrack menggunakan struktur data **stack**. Dimulai dari root, DFS mengunjungi child paling kiri terlebih dahulu hingga mencapai leaf, kemudian kembali dan menelusuri cabang berikutnya. Cocok untuk menelusuri struktur yang dalam.

---

## Struktur Folder

```
Tubes2_En/
├── frontend/          
│   ├── src/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── ...
├── backend/           
│   ├── Program.cs
│   ├── BFSdanDFS.cs
│   ├── CSSselector.cs
│   ├── HTMLGetterandParser.cs
│   └── Backend.csproj
└── README.md
```

---

## Requirement

### Backend
- [.NET SDK 8.0+](https://dotnet.microsoft.com/download)

### Frontend
- [Node.js 18+](https://nodejs.org/)
- npm (sudah termasuk dengan Node.js)

---

## Cara Menjalankan

### 1. Clone repository

```bash
git clone https://github.com/NamaKelompok/Tubes2_NamaKelompok.git
cd Tubes2_En
```

### 2. Jalankan Backend

```bash
cd Backend
dotnet restore
dotnet run
```

Backend akan berjalan di `http://localhost:5000`.

### 3. Jalankan Frontend

Buka terminal baru:

```bash
cd FrontEnd
npm install
npm run dev
```

Frontend akan berjalan di `http://localhost:5173`. Buka URL tersebut di browser.

---

## Cara Penggunaan

1. Pilih **Input Source**: masukkan URL website atau teks HTML langsung
2. Pilih **algoritma** traversal: BFS atau DFS
3. Masukkan **CSS Selector** (contoh: `p`, `.box`, `#header`, `div > p`)
4. Pilih **jumlah hasil**: semua kemunculan atau Top N
5. Klik **Run Traversal**
6. Lihat hasil pada tab:
   - **DOM Tree** — visualisasi pohon dengan highlight traversal
   - **Results** — daftar elemen yang cocok dengan selector
   - **Traversal Log** — log langkah-langkah penelusuran
   - **Errors** — daftar parse error yang ditemukan pada HTML
7. Gunakan tombol animasi (▶ / ⏩) untuk melihat proses traversal secara bertahap
8. Klik **Download tree as PNG** untuk menyimpan visualisasi pohon DOM

---

## Author

| Nathanael Shane Bennet | 13524119  |
| Muhammad Rafi Akbar | 13524125 |
| Salman Faiz Assidiqi | 13524134 |