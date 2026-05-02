/**
 * api-layanan.js - FULL UNIFIED VERSION
 * File ini adalah pusat backend (Database & Logika) untuk index.html DAN admin.html
 */

const BackendAPI = (function() {
    const DB_KEY = 'db_sport_facility';
    
    // Anomali Poin 3 & 4: Matriks Konflik (Multipurpose Court)
    const matriksKonflik = {
        "FUT-01": ["BSK-01"], // Futsal memblokir Basket
        "BSK-01": ["FUT-01"], // Basket memblokir Futsal
        "VOL-01": ["FUT-01"]  // Voli memblokir Futsal
    };

    function getDB() {
        return JSON.parse(localStorage.getItem(DB_KEY) || "[]");
    }

    function saveDB(data) {
        localStorage.setItem(DB_KEY, JSON.stringify(data));
    }

    // Pengecekan Konflik Dua Arah
    function cekKonflik(db, targetIdLapangan, jamTarget, tanggalTarget) {
        const pesananAktif = db.filter(p => 
            p.tanggal_main === tanggalTarget && 
            p.waktu_main.includes(jamTarget) &&
            p.status_pesanan !== "Batal Booking"
        );

        if (pesananAktif.some(p => p.id_lapangan === targetIdLapangan)) return true;

        for (let p of pesananAktif) {
            if (matriksKonflik[p.id_lapangan]?.includes(targetIdLapangan)) return true;
            if (matriksKonflik[targetIdLapangan]?.includes(p.id_lapangan)) return true;
        }
        return false;
    }

    // Ambil Data Booking Spesifik (Untuk Kalender Mingguan Publik)
    function getStatusBooking(db, id_lapangan, jam, tanggal) {
        if (cekKonflik(db, id_lapangan, jam, tanggal)) {
            const pesanan = db.find(p => p.tanggal_main === tanggal && p.waktu_main.includes(jam) && p.status_pesanan !== "Batal Booking" && 
                            (p.id_lapangan === id_lapangan || matriksKonflik[id_lapangan]?.includes(p.id_lapangan) || matriksKonflik[p.id_lapangan]?.includes(id_lapangan)));
            return pesanan ? pesanan.tipe_booking : "Terisi";
        }
        return "Tersedia";
    }

    return {
        // ==========================================
        // 1. ENDPOINT UNTUK PUBLIK (index.html)
        // ==========================================

        getKetersediaanMingguan: function(id_lapangan, jenis_lapangan, arrayTanggal) {
            return new Promise((resolve) => {
                setTimeout(() => {
                    const db = getDB();
                    const slotWaktu = jenis_lapangan === "Tenis" 
                        ? ["06.00 - 09.00", "09.00 - 12.00", "12.00 - 15.00", "15.00 - 18.00", "18.00 - 21.00"] 
                        : ["09.00 - 10.00", "10.00 - 11.00", "11.00 - 12.00", "12.00 - 13.00", "13.00 - 14.00", "14.00 - 15.00", "15.00 - 16.00", "16.00 - 17.00", "17.00 - 18.00", "18.00 - 19.00", "19.00 - 20.00", "20.00 - 21.00"];
                    
                    let jadwalRespons = slotWaktu.map(jam => {
                        let baris = { jam: jam, hari: {} };
                        arrayTanggal.forEach(tgl => {
                            baris.hari[tgl] = getStatusBooking(db, id_lapangan, jam, tgl);
                        });
                        return baris;
                    });
                    
                    resolve(jadwalRespons);
                }, 300);
            });
        },

        buatPesananReguler: function(dataPayload) {
            return new Promise((resolve, reject) => {
                const db = getDB();
                for (let jam of dataPayload.waktu_main) {
                    if (cekKonflik(db, dataPayload.id_lapangan, jam, dataPayload.tanggal_main)) {
                        return reject("Gagal: Lapangan tiba-tiba sudah dipesan oleh orang lain.");
                    }
                }
                const newId = 'ORD-' + Date.now().toString().slice(-6);
                db.push({
                    id_pemesanan: newId,
                    tipe_booking: "Reguler",
                    nama_pelanggan: dataPayload.nama_pelanggan,
                    no_whatsapp: dataPayload.no_whatsapp,
                    email_pelanggan: dataPayload.email_pelanggan,
                    id_lapangan: dataPayload.id_lapangan,
                    tanggal_main: dataPayload.tanggal_main,
                    waktu_main: dataPayload.waktu_main,
                    total_bayar: dataPayload.total_bayar,
                    status_pesanan: "Belum Bayar"
                });
                saveDB(db);
                resolve({ success: true, id_pemesanan: newId });
            });
        },

        // ==========================================
        // 2. ENDPOINT UNTUK ADMIN (admin.html)
        // ==========================================

        getAllPesanan: function() { 
            return new Promise(resolve => resolve(getDB().reverse())); 
        },
        
        updateStatus: function(id, status) {
            return new Promise(resolve => {
                let db = getDB();
                let index = db.findIndex(p => p.id_pemesanan === id);
                if (index !== -1) {
                    db[index].status_pesanan = status;
                    saveDB(db);
                    resolve({ success: true });
                }
            });
        },

        buatPesananMember: function(data) {
            return new Promise((resolve, reject) => {
                let db = getDB();
                let tglMulai = new Date(data.tanggal_mulai);
                let arraySesi = [];
                let idMember = "MBR-" + Math.random().toString(36).substr(2, 5).toUpperCase();

                for (let i = 0; i < 4; i++) {
                    let tglSesi = tglMulai.toISOString().split('T')[0];
                    for (let jam of data.waktu_main) {
                        if (cekKonflik(db, data.id_lapangan, jam, tglSesi)) {
                            return reject(`Gagal: Bentrok pada tanggal ${tglSesi} jam ${jam}.`);
                        }
                    }
                    arraySesi.push({
                        id_pemesanan: `${idMember}-${i+1}`,
                        tipe_booking: "Member Tetap",
                        nama_pelanggan: data.nama_pelanggan,
                        no_whatsapp: data.no_whatsapp,
                        id_lapangan: data.id_lapangan,
                        tanggal_main: tglSesi,
                        waktu_main: data.waktu_main,
                        total_bayar: data.total_harga / 4, // Dibagi per minggu agar pencatatan log rapi
                        status_pesanan: "Booking Sukses"
                    });
                    tglMulai.setDate(tglMulai.getDate() + 7);
                }

                db.push(...arraySesi);
                saveDB(db);
                resolve({ success: true, id_member: idMember });
            });
        },

        buatSpecialEvent: function(data) {
            return new Promise((resolve, reject) => {
                let db = getDB();
                for (let jam of data.waktu_main) {
                    if (cekKonflik(db, data.id_lapangan, jam, data.tanggal_main)) {
                        return reject("Gagal: Lapangan sudah terisi atau berbenturan dengan jadwal lain.");
                    }
                }

                const eventBaru = {
                    id_pemesanan: "EVT-" + Date.now().toString().slice(-5),
                    tipe_booking: "Special Event",
                    nama_pelanggan: data.nama_event,
                    id_lapangan: data.id_lapangan,
                    tanggal_main: data.tanggal_main,
                    waktu_main: data.waktu_main,
                    total_bayar: 0,
                    status_pesanan: "Booking Sukses"
                };

                db.push(eventBaru);
                saveDB(db);
                resolve({ success: true });
            });
        }
    };
})();