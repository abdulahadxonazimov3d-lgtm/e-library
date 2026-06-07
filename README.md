# Elektron Kutubxona BMI — Supabase versiya

Bu versiyada loyiha to‘liq Supabase bilan ishlaydi:

- Supabase Auth: kirish / ro‘yxatdan o‘tish / parol almashtirish
- Supabase Database: kitoblar, statistika, sevimlilar, sharhlar, quiz, foydalanuvchi profillari
- Supabase Storage: PDF kitoblar va kitob rasmlari
- Real vaqt yangilanishlar: admin panelda foydalanuvchilar, quiz, sevimlilar, statistika ko‘rinadi
- PDF mavjud bo‘lsa yuklab olinadi va statistikaga qo‘shiladi
- PDF mavjud bo‘lmasa: “PDF fayl mavjud emas” chiqadi va statistika oshmaydi
- Sevimlilar faqat kitob batafsil sahifasidagi yulduzcha tugmasi orqali ishlaydi
- Admin quiz testlarni cheklanmagan miqdorda tuzadi
- Quiz natijasi foizda chiqadi, to‘g‘ri javob yashil, noto‘g‘ri javob qizil ko‘rinadi

## 1. Supabase sozlash

1. Supabase’da yangi project oching.
2. `supabase/schema.sql` faylini oching.
3. Supabase Dashboard → SQL Editor → New Query.
4. `schema.sql` ichidagi kodni to‘liq joylab **Run** qiling.
5. Authentication → Providers → Email yoqilgan bo‘lsin.
6. BMI demo uchun Authentication → Email confirmation OFF qilsangiz, ro‘yxatdan o‘tgandan keyin foydalanuvchi darhol tizimga kiradi.

## 2. Admin yaratish

1. Saytda oddiy foydalanuvchi sifatida admin email bilan ro‘yxatdan o‘ting.
2. SQL Editor’da quyidagini bajaring:

```sql
update public.profiles
set role='admin', full_name='Admin'
where id = (select id from auth.users where email='admin@kutubxona.uz');
```

Emailni o‘zingizning admin emailingizga almashtiring.

## 3. Lokal ishga tushirish

```bash
npm install
cp .env.example .env
npm run dev
```

`.env` ichiga Supabase URL va anon key yozing.

## 4. Vercel sozlamalari

Vercel → Project → Settings → Environment Variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Build sozlamalari:

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## 5. Supabase Storage

`schema.sql` avtomatik 2 ta public bucket yaratadi:

- `book-covers`
- `book-pdfs`

Admin panel orqali rasm va PDF yuklanadi.


## Yakuniy tekshiruv va muhim eslatmalar

Ushbu versiyada kod `npm run build` orqali tekshirildi. GitHub → Vercel → Supabase sxemasida ishlashi uchun quyidagilar shart:

1. Supabase SQL Editor’da `supabase/schema.sql` to‘liq bajarilishi kerak.
2. Supabase Auth’da Email provider yoqilgan bo‘lishi kerak.
3. Agar ro‘yxatdan o‘tgandan keyin darhol kirishini xohlasangiz, Supabase’da Email confirmation OFF qiling.
4. Admin foydalanuvchini saytda avval ro‘yxatdan o‘tkazing, keyin README’dagi SQL orqali `role='admin'` qiling.
5. Admin role berilgandan keyin saytdan chiqib, qayta kiring.
6. Vercel Environment Variables ichida `VITE_SUPABASE_URL` va `VITE_SUPABASE_ANON_KEY` yozilishi shart.
7. PDF yuklash Supabase Storage orqali ishlaydi; PDF admin tomonidan yuklanmagan bo‘lsa foydalanuvchiga “PDF fayl mavjud emas” chiqadi va statistika oshmaydi.
8. Supabase free plan’da Storage hajmi va bandwidth chegaralari bor. Katta PDF fayllar uchun shu limitlarga e’tibor bering.

100% ishlashi Supabase sozlamalari to‘g‘ri bajarilishiga bog‘liq. Kod tomoni builddan o‘tdi va asosiy xatoliklar tuzatildi.
