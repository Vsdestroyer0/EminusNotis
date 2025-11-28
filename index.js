const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const Alexa = require('ask-sdk-core');
const axios = require('axios'); // Mover aquí para que esté disponible globalmente
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// -------- 1. Endpoint de autorización simplificado (sin formulario) --------
app.get('/authorize', (req, res) => {
    // Credenciales hardcodeadas para pruebas
    const username = "zs23014164";
    const password = "Y1k8Z77e3Bt5Gz6NVvZ8qNuOy2WgLKnGHfRerpfP2ngfLP9QwrCmDb87C0G2Hk5J"
    const { redirect_uri, state } = req.query;

    // Genera code con credenciales reales
    const code = Buffer.from(`${username}:${password}`).toString('base64');
    res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
});

// -------- 2. Endpoint de autenticación real --------
app.post('/auth', async (req, res) => {
    const { username, password, redirect_uri, state } = req.body;
    
    try {
        // Llamada a la API de Eminus
        const response = await axios.post('https://eminus.uv.mx/eminusapi/api/auth', {
            username: username,
            password: password
        });
        
        // Genera code con el token real de Eminus
        const code = Buffer.from(`${username}:${response.data.accessToken}`).toString('base64');
        res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
        
    } catch (error) {
        console.error('Error en autenticación:', error.response?.data || error.message);
        res.status(401).send('Credenciales inválidas');
    }
});

// -------- 3. Página callback para OAuth --------
app.get('/callback', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'callback.html'));
});

// -------- 3. Página principal --------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------- 4. Token exchange endpoint (Alexa POST aquí) --------
app.post('/token', bodyParser.urlencoded({ extended: false }), async (req, res) => {
    const { code } = req.body;
    const decoded = Buffer.from(code, 'base64').toString();
    const [username, password] = decoded.split(':');
    
    if (!username || !password) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
    }
    
    try {
        // Llamada real a la API de Eminus con credenciales hardcodeadas
        const response = await axios.post('https://eminus.uv.mx/eminusapi/api/auth', {
            username: username,
            password: password
        });
        
        console.log('✅ Autenticación exitosa con Eminus para usuario:', username);
        
        res.json({
            access_token: response.data.accessToken,
            token_type: "Bearer",
            expires_in: 3600
        });
    } catch (error) {
        console.error('❌ Error en autenticación Eminus:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            res.status(401).json({ 
                error: 'invalid_grant',
                error_description: 'Credenciales inválidas en Eminus'
            });
        } else {
            res.status(500).json({ 
                error: 'server_error',
                error_description: 'Error al conectar con Eminus API'
            });
        }
    }
});

// -------- 3. Alexa Skill Handlers --------

// Handler para LaunchRequest (al abrir la skill)
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = "Bienvenido a Tareas Eminus. Puedes pedirme tus tareas pendientes.";
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Qué deseas hacer?")
            .getResponse();
    }
};

// Handler para IntentRequest de tareas pendientes
const TareasPendientesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TareasPendientesIntent';
    },
    async handle(handlerInput) {
        // Importar axios dentro del handler para asegurar disponibilidad
        const axios = require('axios');
        
        // Temporalmente sin verificar token para pruebas
        // const token = handlerInput.requestEnvelope.context.System.user.accessToken;
        
        try {
            // Llamada directa a Eminus API con credenciales hardcodeadas
            const authResponse = await axios.post('https://eminus.uv.mx/eminusapi/api/auth', {
                username: "zs23014164",
                password: "Y1k8Z77e3Bt5Gz6NVvZ8qNuOy2WgLKnGHfRerpfP2ngfLP9QwrCmDb87C0G2Hk5J"
            });
            
            console.log('✅ Token obtenido directamente de Eminus');
            
            // Obtener cursos con el token
            const coursesResponse = await axios.get('https://eminus.uv.mx/eminusapi8/api/Course/getAllCourses', {
                headers: {
                    'Authorization': `Bearer ${authResponse.data.accessToken}`
                }
            });
            
            console.log('✅ Cursos obtenidos:', coursesResponse.data);
            
            // Extraer información relevante de los cursos
            const cursos = coursesResponse.data;
            let tareas = [];
            
            if (cursos && cursos.length > 0) {
                // Filtrar solo cursos favoritos (activos)
                const cursosFavoritos = cursos.filter(curso => 
                    curso.curso?.esFavorito === 1 && 
                    curso.curso?.visible === 1
                );
                
                console.log(`✅ Cursos favoritos encontrados: ${cursosFavoritos.length}`);
                
                // Obtener actividades de cada curso favorito
                for (const cursoData of cursosFavoritos) {
                    const curso = cursoData.curso;
                    const idCurso = curso.idCurso;
                    const nombreCurso = curso.nombre;
                    
                    try {
                        // Obtener actividades del curso
                        const actividadesResponse = await axios.get(
                            `https://eminus.uv.mx/eminusapi8/api/Activity/getActividadesEstudiante/${idCurso}`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${authResponse.data.accessToken}`
                                }
                            }
                        );
                        
                        const actividades = actividadesResponse.data.contenido || [];
                        
                        if (actividades.length > 0) {
                            console.log(`✅ Curso ${nombreCurso}: ${actividades.length} actividades`);
                            
                            // Procesar cada actividad para obtener detalles
                            for (const actividad of actividades) {
                                const titulo = actividad.titulo || 'Actividad sin título';
                                const fechaTermino = actividad.fechaTermino ? 
                                    new Date(actividad.fechaTermino).toLocaleDateString('es-MX') : 
                                    'sin fecha';
                                const estadoAct = actividad.estadoAct || 0;
                                
                                // Estado 2 = pendiente, otros estados = completada/entregada
                                if (estadoAct === 2) {
                                    tareas.push(`${titulo} del curso ${nombreCurso} para el ${fechaTermino}`);
                                }
                            }
                        }
                        
                    } catch (error) {
                        console.error(`❌ Error obteniendo actividades del curso ${idCurso}:`, error.message);
                        // Continuar con el siguiente curso si hay error
                        continue;
                    }
                }
            }
            
            // Si no hay tareas pendientes, mostrar mensaje
            if (tareas.length === 0) {
                tareas = ["No tienes actividades pendientes en tus cursos favoritos"];
            } else {
                // Limitar a 5 tareas para no hacer muy larga la respuesta
                tareas = tareas.slice(0, 5);
            }
            
            const speakOutput = tareas.length === 1 ? 
                `Tienes ${tareas.length} tarea pendiente: ${tareas[0]}.` :
                `Tienes ${tareas.length} tareas pendientes: ${tareas.join(', ')}.`;
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt("¿Quieres conocer los detalles de alguna tarea específica?")
                .getResponse();
                
        } catch (error) {
            console.error('❌ Error obteniendo token de Eminus:', error.response?.data || error.message);
            return handlerInput.responseBuilder
                .speak("Hubo un error al conectar con Eminus. Por favor, intenta nuevamente más tarde.")
                .getResponse();
        }
    }
};

// Handler de Fallback para debug
const FallbackHandler = {
    canHandle(handlerInput) { return true; },
    handle(handlerInput) {
        console.log("[DEBUG]: Request desconocida:", JSON.stringify(handlerInput.requestEnvelope, null, 2));
        return handlerInput.responseBuilder
            .speak("Request no reconocida por el demo.")
            .getResponse();
    }
};

// SkillBuilder con handlers
const skill = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        TareasPendientesIntentHandler,
        FallbackHandler // SIEMPRE AL FINAL
    )
    .create();

// Endpoint de la skill que Alexa invoca
app.post('/skill', (req, res) => {
    console.log("[IN] Pedido Alexa:", JSON.stringify(req.body, null, 2));
    skill.invoke(req.body)
        .then((responseBody) => res.json(responseBody))
        .catch((err) => {
            console.error('Alexa Skill error:', err);
            res.status(500).send('Alexa Skill error');
        });
});

// -------- 5. Endpoint para verificar token (opcional) --------
app.post('/verify-token', (req, res) => {
    const { accessToken } = req.body;
    
    if (accessToken === "FAKE_ACCESS_TOKEN_EMINUS") {
        res.json({ 
            valid: true, 
            username: "zs23014164",
            message: "Token válido" 
        });
    } else {
        res.status(401).json({ 
            valid: false, 
            message: "Token inválido" 
        });
    }
});

// -------- 6. Página principal (mantenida por compatibilidad) --------
app.get('/demo', (req, res) => {
    res.send('Backend OAuth2 + Alexa Skill activo. DEMO hardcodeado.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`OAuth2 + Alexa Skill DEMO corriendo en el puerto ${PORT}`);
});
