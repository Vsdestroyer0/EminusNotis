const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
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

// -------- 2. Recibe credenciales, valida y redirige con código --------
app.post('/auth', async (req, res) => {
    const { username, password, redirect_uri, state } = req.body;
    try {
        const eminusRes = await axios.post('https://eminus.uv.mx/eminusapi/api/auth', {
            username, password
        });
        if (eminusRes.data.accessToken) {
            // Genera un code único (puedes mejorar la seguridad usando DB)
            const code = Buffer.from(`${username}:${eminusRes.data.accessToken}`).toString('base64');
            // Redirige a Alexa con el code, como pide OAuth2
            res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
        } else {
            res.send('Login inválido. Revisa tu usuario y contraseña.');
        }
    } catch (err) {
        res.send('Error al validar usuario.');
    }
});

// -------- 3. Token exchange endpoint (Alexa POST aquí) --------
app.post('/token', bodyParser.urlencoded({ extended: false }), (req, res) => {
    const { code, client_id, client_secret, redirect_uri, grant_type } = req.body;
    const decoded = Buffer.from(code, 'base64').toString();
    const [username, accessToken] = decoded.split(':');
    if (accessToken) {
        res.json({
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: 3600 // Puedes ajustar según el token de Eminus
        });
    } else {
        res.status(400).json({ error: 'invalid_grant' });
    }
});

// -------- 4. Landing page básica o salud --------
app.get('/', (req, res) => {
    res.send('Backend OAuth2 para Alexa Skill activo.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`OAuth2 backend corriendo en el puerto ${PORT}`);
});
