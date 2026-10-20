package com.example.antigravitypos

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var activePrintWebView: WebView? = null
    private val CAMERA_PERMISSION_REQUEST_CODE = 1001
    private val LOCAL_DEV_URL = "http://localhost:3000/"
    private val CLOUD_URL = "https://sunshine-inventry-management-system.vercel.app/"
    private var activeBaseUrl: String = CLOUD_URL

    inner class AndroidPrintBridge {
        @JavascriptInterface
        fun printReceiptHtml(invoiceId: String, htmlContent: String) {
            runOnUiThread {
                try {
                    // Create an off-screen WebView to render the thermal receipt HTML
                    activePrintWebView = WebView(this@MainActivity).apply {
                        settings.javaScriptEnabled = false
                        webViewClient = object : WebViewClient() {
                            override fun onPageFinished(view: WebView?, url: String?) {
                                val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                                val printAdapter = createPrintDocumentAdapter("Receipt_$invoiceId")
                                val jobName = "Receipt_$invoiceId"
                                printManager.print(
                                    jobName,
                                    printAdapter,
                                    PrintAttributes.Builder()
                                        .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                                        .build()
                                )
                            }
                        }
                        loadDataWithBaseURL(activeBaseUrl, htmlContent, "text/html", "UTF-8", null)
                    }
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Print error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun shareReceiptText(text: String) {
            runOnUiThread {
                try {
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, text)
                    }
                    startActivity(Intent.createChooser(intent, "Share Receipt"))
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Share error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Request runtime Camera permission
        checkAndRequestCameraPermission()

        webView = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.parseColor("#0f172a"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                loadWithOverviewMode = true
                useWideViewPort = true
            }

            // Native Android Printing and Sharing Bridge
            addJavascriptInterface(AndroidPrintBridge(), "AndroidPOS")

            // Apply system bar insets (status bar & nav bar) so app fits screen perfectly
            androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(this) { view, insets ->
                val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }

            // Custom WebChromeClient to grant camera permission for html5-qrcode
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest?) {
                    runOnUiThread {
                        request?.let {
                            // Automatically grant camera and audio permissions to the app
                            it.grant(it.resources)
                        }
                    }
                }
            }

            // Keep navigation inside WebView
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    errorCode: Int,
                    description: String?,
                    failingUrl: String?
                ) {
                    super.onReceivedError(view, errorCode, description, failingUrl)
                    Toast.makeText(
                        this@MainActivity,
                        "Connecting to server: $description",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }

        // Wrap WebView in FrameLayout with fitsSystemWindows = true
        val rootLayout = android.widget.FrameLayout(this).apply {
            fitsSystemWindows = true
            setBackgroundColor(android.graphics.Color.parseColor("#0f172a"))
            addView(
                webView,
                android.widget.FrameLayout.LayoutParams(
                    android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                    android.widget.FrameLayout.LayoutParams.MATCH_PARENT
                )
            )
        }

        setContentView(rootLayout)

        // Load with smart dual connectivity: check local dev server (port 3000) first; fallback to Vercel cloud
        Thread {
            var urlToLoad = CLOUD_URL
            try {
                val connection = java.net.URL(LOCAL_DEV_URL).openConnection() as java.net.HttpURLConnection
                connection.connectTimeout = 500
                connection.readTimeout = 500
                connection.requestMethod = "HEAD"
                val responseCode = connection.responseCode
                if (responseCode in 200..399) {
                    urlToLoad = LOCAL_DEV_URL
                }
            } catch (e: Exception) {
                urlToLoad = CLOUD_URL
            }

            activeBaseUrl = urlToLoad
            runOnUiThread {
                webView.loadUrl(urlToLoad)
            }
        }.start()
    }

    private fun checkAndRequestCameraPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.CAMERA),
                CAMERA_PERMISSION_REQUEST_CODE
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Camera permission granted", Toast.LENGTH_SHORT).show()
                webView.reload()
            } else {
                Toast.makeText(
                    this,
                    "Camera permission is required for barcode scanning",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
