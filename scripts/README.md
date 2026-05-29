# Скриптове за поддръжка

## Миграция на снимки → Firebase Storage (Етап 2)

Прехвърля **съществуващите** base64 снимки от документите на клиентите в Firebase
Storage и заменя полето `photo` с URL. Новите снимки вече се качват в Storage
автоматично (Етап 1) — този скрипт се грижи само за старите данни.

### 0. Преди всичко — пълен бекъп (силно препоръчително)
Освен бекъпа, който прави самият скрипт, направи и пълен експорт на Firestore:

```
gcloud firestore export gs://darycard-6e8e7.appspot.com/backups/$(date +%Y%m%d)
```

### 1. Service account ключ
Firebase Console → ⚙️ Project settings → **Service accounts** → **Generate new
private key**. Запази файла като `scripts/serviceAccountKey.json`.
(Той е в `.gitignore` — никога не го качвай в git.)

### 2. Инсталиране
```
cd scripts
npm install
```

### 3. Пускане — постепенно и безопасно
```
# а) Само виж какво ще се случи (нищо не се променя)
node migrate-photos.mjs --dry-run

# б) Само направи бекъп файла, без миграция
node migrate-photos.mjs --backup-only

# в) Истинската миграция (прави бекъп + мигрира)
node migrate-photos.mjs
```

Скриптът:
- пагинира (не товари паметта),
- записва оригинала на всяка снимка в `photo-backup-<време>.jsonl` **преди** да я
  промени,
- е идемпотентен — пропуска вече мигрираните, така че може да се пусне пак ако
  спре по средата.

### 4. Връщане назад (само при нужда)
```
node restore-photos.mjs photo-backup-<време>.jsonl
```

### Проверка след миграция
- Firestore → клиент → полето `photo` е `https://firebasestorage...` URL.
- Storage → `client_photos/` → има `.jpg` файлове.
- Отвори няколко клиентски профила → снимките се виждат.
