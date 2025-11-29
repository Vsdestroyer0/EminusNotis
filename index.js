const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const Alexa = require('ask-sdk-core');

// Constantes de configuración
const EMINUS_CONFIG = {
    BASE_URL: 'https://eminus.uv.mx',
    API_URL: 'https://eminus.uv.mx/eminusapi',
    API8_URL: 'https://eminus.uv.mx/eminusapi8',
    USERNAME: 'zs23014164',
    PASSWORD: 'Y1k8Z77e3Bt5Gz6NVvZ8qNuOy2WgLKnGHfRerpfP2ngfLP9QwrCmDb87C0G2Hk5J',
    SKILL_ID: 'amzn1.ask.skill.94d76127-fc68-40eb-979b-0a88e646b511'
};

const EMINUS_ENDPOINTS = {
    AUTH: `${EMINUS_CONFIG.API_URL}/api/auth`,
    COURSES: `${EMINUS_CONFIG.API8_URL}/api/Course/getAllCourses`,
    ACTIVITIES: (idCurso) => `${EMINUS_CONFIG.API8_URL}/api/Activity/getActividadesEstudiante/${idCurso}`,
    ACTIVITY_DETAIL: (idCurso, idActividad) => `${EMINUS_CONFIG.API8_URL}/api/Activity/getActividadEstudiante/${idCurso}/${idActividad}`
};

const HTML_ENTITY_MAP = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&aacute;': 'á',
    '&eacute;': 'é',
    '&iacute;': 'í',
    '&oacute;': 'ó',
    '&uacute;': 'ú',
    '&Aacute;': 'Á',
    '&Eacute;': 'É',
    '&Iacute;': 'Í',
    '&Oacute;': 'Ó',
    '&Uacute;': 'Ú',
    '&ntilde;': 'ñ',
    '&Ntilde;': 'Ñ',
    '&uuml;': 'ü',
    '&Uuml;': 'Ü',
    '&iexcl;': '¡',
    '&iquest;': '¿'
};

function decodeHtmlEntities(text = '') {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&[a-zA-Z]+;/g, (entity) => HTML_ENTITY_MAP[entity] || entity);
}

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// -------- 1. Endpoint de autorización simplificado (sin formulario) --------
app.get('/authorize', (req, res) => {
    const { redirect_uri, state } = req.query;

    // Genera code con credenciales reales
    const code = Buffer.from(`${EMINUS_CONFIG.USERNAME}:${EMINUS_CONFIG.PASSWORD}`).toString('base64');
    res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
});

// -------- 2. Endpoint de autenticación real --------
app.post('/auth', async (req, res) => {
    const { username, password, redirect_uri, state } = req.body;
    
    try {
        // Llamada a la API de Eminus
        const response = await axios.post(EMINUS_ENDPOINTS.AUTH, {
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
        const response = await axios.post(EMINUS_ENDPOINTS.AUTH, {
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

// Helper function para autenticación con Eminus
async function authenticateWithEminus() {
    const axios = require('axios');
    
    try {
        const response = await axios.post(EMINUS_ENDPOINTS.AUTH, {
            username: EMINUS_CONFIG.USERNAME,
            password: EMINUS_CONFIG.PASSWORD
        });
        
        console.log('✅ Autenticación exitosa con Eminus');
        return response.data.accessToken;
    } catch (error) {
        console.error('❌ Error en autenticación Eminus:', error.response?.data || error.message);
        throw error;
    }
}

// Helper function para obtener cursos favoritos
async function getFavoriteCourses(accessToken) {
    const axios = require('axios');
    
    try {
        const coursesResponse = await axios.get(EMINUS_ENDPOINTS.COURSES, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        const cursos = coursesResponse.data.contenido || [];
        const cursosFavoritos = cursos.filter(curso => 
            curso.curso?.esFavorito === 1 && 
            curso.curso?.visible === 1
        );
        
        console.log(`✅ Cursos favoritos encontrados: ${cursosFavoritos.length}`);
        return cursosFavoritos;
    } catch (error) {
        console.error('❌ Error obteniendo cursos:', error.response?.data || error.message);
        throw error;
    }
}

// Helper function para obtener actividades de un curso
async function getCourseActivities(accessToken, idCurso) {
    const axios = require('axios');
    
    try {
        const actividadesResponse = await axios.get(EMINUS_ENDPOINTS.ACTIVITIES(idCurso), {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        return actividadesResponse.data.contenido || [];
    } catch (error) {
        if (error.response?.status === 404) {
            console.log(`ℹ️ Curso ${idCurso} no tiene actividades disponibles`);
            return [];
        }
        throw error;
    }
}

// Helper function para obtener detalles de una actividad
async function getActivityDetails(accessToken, idCurso, idActividad) {
    const axios = require('axios');
    
    try {
        const detallesResponse = await axios.get(EMINUS_ENDPOINTS.ACTIVITY_DETAIL(idCurso, idActividad), {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        return detallesResponse.data.contenido[0];
    } catch (error) {
        console.error('❌ Error obteniendo detalles de actividad:', error.response?.data || error.message);
        throw error;
    }
}

async function buildPendingTasks(accessToken) {
    const cursosFavoritos = await getFavoriteCourses(accessToken);
    const tareas = [];

    for (const cursoData of cursosFavoritos) {
        const curso = cursoData.curso;
        const idCurso = curso.idCurso;
        const nombreCurso = curso.nombre;

        console.log(`🔍 Procesando curso: ${nombreCurso} (ID: ${idCurso})`);

        const actividades = await getCourseActivities(accessToken, idCurso);
        console.log(`📋 Actividades encontradas en ${nombreCurso}: ${actividades.length}`);

        for (const actividad of actividades) {
            const titulo = actividad.titulo || 'Actividad sin título';
            const fechaTermino = actividad.fechaTermino ?
                new Date(actividad.fechaTermino).toLocaleDateString('es-MX') :
                'sin fecha';
            const estadoAct = actividad.estadoAct || 0;
            const estadoEntrega = actividad.estadoEntrega;
            const estado = actividad.estado;

            console.log(`📝 Actividad: "${titulo}" - EstadoAct: ${estadoAct} - EstadoEntrega: ${estadoEntrega} - Estado: ${estado} - Fecha: ${fechaTermino}`);

            if (estadoAct !== 2) continue;
            if (!(estadoEntrega == null && estado == null)) continue;

            tareas.push({
                displayText: `${titulo} del curso ${nombreCurso} para el ${fechaTermino}`,
                idCurso,
                idActividad: actividad.idActividad,
                titulo,
                nombreCurso,
                fechaTermino
            });
        }
    }

    return tareas;
}

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

// Handler para NotificacionesIntent (mismo comportamiento que TareasPendientesIntent)
const NotificacionesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NotificacionesIntent';
    },
    async handle(handlerInput) {
        try {
            const accessToken = await authenticateWithEminus();
            const todasLasTareas = await buildPendingTasks(accessToken);

            let tareasParaRespuesta;
            if (todasLasTareas.length === 0) {
                tareasParaRespuesta = [{ displayText: "No tienes actividades pendientes en tus cursos favoritos" }];
            } else {
                tareasParaRespuesta = todasLasTareas.slice(0, 5);
            }

            const tareasEnumeradas = tareasParaRespuesta.map((t, idx) => `${idx + 1}.- ${t.displayText}`);

            const attributes = handlerInput.attributesManager.getSessionAttributes();
            attributes.tareasPendientes = tareasParaRespuesta;
            handlerInput.attributesManager.setSessionAttributes(attributes);

            const speakOutput = tareasEnumeradas.length === 1 ? 
                `Tienes ${tareasEnumeradas.length} tarea pendiente: ${tareasEnumeradas[0]}. ¿Quieres conocer los detalles de alguna tarea específica?` :
                `Tienes ${tareasEnumeradas.length} tareas pendientes: ${tareasEnumeradas.join('. ')}. ¿Quieres conocer los detalles de alguna tarea específica?`;

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

// Handler para DetallesTareaIntent
const DetallesTareaIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'DetallesTareaIntent';
    },
    async handle(handlerInput) {
        try {
            // Obtener el número de tarea del request
            const numeroTarea = handlerInput.requestEnvelope.request.intent.slots.numero.value;
            
            if (!numeroTarea) {
                return handlerInput.responseBuilder
                    .speak("Por favor, dime el número de la tarea que quieres consultar.")
                    .reprompt("¿Qué número de tarea quieres revisar?")
                    .getResponse();
            }
            
            const attributes = handlerInput.attributesManager.getSessionAttributes();
            const tareasPendientes = attributes.tareasPendientes || [];
            
            if (tareasPendientes.length === 0) {
                return handlerInput.responseBuilder
                    .speak("Primero pídeme tus tareas pendientes y luego dime el número que quieres revisar.")
                    .reprompt("¿Quieres que te diga tus tareas pendientes?")
                    .getResponse();
            }
            
            const index = parseInt(numeroTarea) - 1;
            
            if (index < 0 || index >= tareasPendientes.length) {
                return handlerInput.responseBuilder
                    .speak(`No encontré la tarea número ${numeroTarea}. Tienes ${tareasPendientes.length} tareas disponibles.`)
                    .reprompt("¿Quieres consultar otra tarea?")
                    .getResponse();
            }
            
            const tareaSeleccionada = tareasPendientes[index];

            if (!tareaSeleccionada.idCurso || !tareaSeleccionada.idActividad) {
                return handlerInput.responseBuilder
                    .speak("No tengo los datos necesarios de esa tarea. Pide de nuevo tus tareas pendientes y vuelve a intentarlo.")
                    .reprompt("¿Quieres que te diga tus tareas pendientes?")
                    .getResponse();
            }

            const accessToken = await authenticateWithEminus();
            const actividad = await getActivityDetails(accessToken, tareaSeleccionada.idCurso, tareaSeleccionada.idActividad);
            
            // Construir respuesta con los detalles
            let respuesta = `Detalles de la tarea: ${actividad.titulo}. `;
            
            // Tipo de actividad
            if (actividad.idTipoEquipo == null && actividad.tipoEquipo == null) {
                respuesta += "Es una actividad individual. ";
            } else {
                respuesta += `Es una actividad en equipo: ${actividad.tipoEquipo || 'Tipo no especificado'}. `;
            }
            
            // Fecha de término
            const fechaTermino = actividad.fechaTermino ? 
                new Date(actividad.fechaTermino).toLocaleDateString('es-MX') : 
                'sin fecha';
            respuesta += `Fecha de entrega: ${fechaTermino}. `;
            
            // Adjuntos
            const tieneAdjuntos = actividad.tieneAdjuntos || 0;
            respuesta += `Tiene ${tieneAdjuntos} archivos adjuntos. `;
            
            // Rúbrica
            if (actividad.idRubrica) {
                respuesta += "Cuenta con rúbrica de evaluación. ";
            } else {
                respuesta += "No cuenta con rúbrica. ";
            }
            
            // Descripción (limpiar HTML)
            let descripcion = actividad.descripcion || '';
            descripcion = descripcion.replace(/<[^>]*>/g, '');
            descripcion = decodeHtmlEntities(descripcion);
            descripcion = descripcion.substring(0, 200) + (descripcion.length > 200 ? '...' : '');
            respuesta += `Descripción: ${descripcion}. `;
            
            // Integrantes si es en equipo
            if (actividad.integrantes && actividad.integrantes.length > 0) {
                const nombresIntegrantes = actividad.integrantes.map(int => int.nombreCompleto || 'Integrante sin nombre').join(', ');
                respuesta += `Integrantes: ${nombresIntegrantes}. `;
            }
            
            return handlerInput.responseBuilder
                .speak(respuesta)
                .reprompt("¿Quieres consultar los detalles de otra tarea?")
                .getResponse();
                
        } catch (error) {
            console.error('❌ Error obteniendo detalles de tarea:', error.response?.data || error.message);
            return handlerInput.responseBuilder
                .speak("Hubo un error al obtener los detalles de la tarea. Por favor, intenta nuevamente.")
                .reprompt("¿Quieres intentar con otra tarea?")
                .getResponse();
        }
    }
};

// Handler para IntentRequest de tareas pendientes
const TareasPendientesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TareasPendientesIntent';
    },
    async handle(handlerInput) {
        try {
            const accessToken = await authenticateWithEminus();
            const todasLasTareas = await buildPendingTasks(accessToken);

            let tareasParaRespuesta;
            if (todasLasTareas.length === 0) {
                tareasParaRespuesta = [{ displayText: "No tienes actividades pendientes en tus cursos favoritos" }];
            } else {
                tareasParaRespuesta = todasLasTareas.slice(0, 5);
            }

            const tareasEnumeradas = tareasParaRespuesta.map((t, idx) => `${idx + 1}.- ${t.displayText}`);

            const attributes = handlerInput.attributesManager.getSessionAttributes();
            attributes.tareasPendientes = tareasParaRespuesta;
            handlerInput.attributesManager.setSessionAttributes(attributes);

            const speakOutput = tareasEnumeradas.length === 1 ? 
                `Tienes ${tareasEnumeradas.length} tarea pendiente: ${tareasEnumeradas[0]}. ¿Quieres conocer los detalles de alguna tarea específica?` :
                `Tienes ${tareasEnumeradas.length} tareas pendientes: ${tareasEnumeradas.join('. ')}. ¿Quieres conocer los detalles de alguna tarea específica?`;

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
        NotificacionesIntentHandler,
        TareasPendientesIntentHandler,
        DetallesTareaIntentHandler,
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
