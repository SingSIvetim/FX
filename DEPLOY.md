# 🚂 Deploy ImageFX Generator to Railway

## Quick Deploy Steps:

### 1. **Create Railway Account**
- Go to [railway.app](https://railway.app)
- Sign up with GitHub

### 2. **Upload Your Project**
- Create a new GitHub repository
- Upload all your project files
- Or use Railway's direct deploy

### 3. **Deploy on Railway**
- Click "Deploy from GitHub repo"
- Select your repository
- Railway will automatically detect Node.js
- It will run `npm start` (which runs your server)

### 4. **Configure Environment**
- Railway will provide a public URL
- Your UI will be available at: `https://your-app.railway.app`
- File uploads will work in the `/tmp` directory

### 5. **Access Your App**
- Visit the provided Railway URL
- Your ImageFX Generator UI will be live!

## 🔧 Troubleshooting "Failed to fetch" Errors

### **Check Railway Logs First:**
1. Go to your Railway project dashboard
2. Click on "Deployments" tab
3. Check the latest deployment logs
4. Look for these success messages:
   ```
   🚀 Starting ImageFX Generator...
   ✅ tsx is available
   🚀 Server running at http://0.0.0.0:PORT
   📊 Health check available at http://0.0.0.0:PORT/health
   ```

### **Common Issues & Solutions:**

**❌ Issue: "tsx not found"**
- ✅ Solution: The start.js script auto-installs tsx if missing

**❌ Issue: "Port already in use"**
- ✅ Solution: Railway automatically sets PORT environment variable

**❌ Issue: "Cannot find module"**
- ✅ Solution: All dependencies are in package.json

**❌ Issue: "Health check failing"**
- ✅ Solution: Check if /health endpoint is accessible

### **Manual Debugging Steps:**

1. **Test health endpoint:**
   ```
   https://your-railway-url.railway.app/health
   ```

2. **Force redeploy:**
   - Go to Railway dashboard
   - Click "Deploy" to force fresh deployment
   - Check logs for new errors

3. **Check environment:**
   - Ensure NODE_ENV is set
   - Ensure PORT is set by Railway

### **Alternative: Use Railway CLI**
```bash
npm install -g @railway/cli
railway login
railway link
railway up
```

## Important Notes:
- ✅ Railway provides persistent storage for your images
- ✅ Automatic HTTPS certificate
- ✅ Free tier: 500 hours/month (plenty for personal use)
- ✅ No configuration needed - works out of the box

## Alternative: Direct Upload
If you don't want to use GitHub:
1. Zip your entire project folder
2. Go to Railway dashboard
3. "Deploy from local directory"
4. Upload the zip file

Your ImageFX Generator will be live in minutes! 🎉
