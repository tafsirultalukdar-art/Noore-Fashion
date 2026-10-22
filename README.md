# Nooré Modest Wear: shop with database

## Folder contents
- `public/index.html`  the website (shop, order form, admin panel)
- `server.js`          the server: connects to MongoDB and gives the website its data
- `package.json`       list of required packages
- `.env`               your secret settings (database password etc.). NEVER share or upload this file.
- `.env.example`       a blank copy of the settings, for reference

## Why a server?
The database password must never be placed inside the website file, because anyone can open and read it.
Here the password stays only in `.env` on the server. The website talks to the server, and the server talks to the database.

## Step 1: Fill in `.env`
1. Open MongoDB Atlas, then Connect, then Drivers, and copy your connection string.
2. In `.env`, set `MONGODB_URI` to it. Username is `tafsirultalukdar_db_user`. Paste your password and cluster host.
3. Set `ADMIN_KEY` (first admin key) and `SESSION_SECRET` (long random text).
4. In Atlas, Network Access, allow your server's IP. For hosting services, use `0.0.0.0/0` (allow from anywhere).

## Step 2: Run on your computer (test)
Install Node.js (version 18 or newer), then in this folder:
```
npm install
npm start
```
Open http://localhost:3000. Admin: scroll to the footer and tap "Admin".

## Step 3: Put it online (example: Render.com, free plan)
1. Upload this folder to a GitHub repository (the `.env` file is ignored automatically by `.gitignore`).
2. On Render: New, Web Service, connect the repository. Build command `npm install`, start command `npm start`.
3. In Render, Environment: add `MONGODB_URI`, `DB_NAME`, `ADMIN_KEY`, `SESSION_SECRET`.
4. Deploy. You get a link like `https://noore.onrender.com`. Use it on your Facebook page.

## Admin panel
Footer, "Admin", then the security key. Add, edit, remove and mark products sold out. Every change is saved to the database
immediately and is live for customers. Use "Change security key" to change the key.

## Security notes
- The password you posted in chat is visible to others who can see that chat. After setup, change the database user password in Atlas (Database Access, Edit) and update `.env`.
- Admin login: 5 wrong tries locks that device for 15 minutes. Admin sessions last 12 hours.
- Only the admin key can add, edit or remove products. Customers can only read products.
