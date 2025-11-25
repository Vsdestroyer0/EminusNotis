const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -------- 1. Endpoint de autorización: muestra login web --------
app.get('/authorize', (req, res) => {
    const { client_id, redirect_uri, state } = req.query;
    res.render('login', { redirect_uri, state, client_id });
});

// -------- 2. Recibe credenciales hardcodeadas, valida y redirige con code --------
app.post('/auth', (req, res) => {
    const { username, password, redirect_uri, state } = req.body;
    // Hardcodea tus datos únicos
    if (username === "zs23014164" && password === "Vsdestroyer=185") {
        const fakeToken = "FAKE_ACCESS_TOKEN_EMINUS";
        const code = Buffer.from(`${username}:${fakeToken}`).toString('base64');
        res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
    } else {
        res.send('Login inválido. Revisa tu usuario y contraseña.');
    }
});

// -------- 3. Token exchange endpoint (Alexa POST aquí) --------
app.post('/token', bodyParser.urlencoded({ extended: false }), (req, res) => {
    const { code } = req.body;
    const decoded = Buffer.from(code, 'base64').toString();
    const [username, accessToken] = decoded.split(':');
    if (accessToken) {
        res.json({
            access_token: accessToken, // Siempre será FAKE_ACCESS_TOKEN_EMINUS
            token_type: "Bearer",
            expires_in: 3600
        });
    } else {
        res.status(400).json({ error: 'invalid_grant' });
    }
});

// -------- 4. Página principal --------
app.get('/', (req, res) => {
    res.send('Backend OAuth2 para Alexa Skill activo. DEMO hardcodeado.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`OAuth2 backend DEMO corriendo en el puerto ${PORT}`);
});
