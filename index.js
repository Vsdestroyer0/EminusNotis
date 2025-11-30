const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const Alexa = require('ask-sdk-core');
const session = require('express-session');

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
    ACTIVITY_DETAIL: (idCurso, idActividad) => `${EMINUS_CONFIG.API8_URL}/api/Activity/getActividadEstudiante/${idCurso}/${idActividad}`,
    COURSE_MEMBERS: (idCurso) => `${EMINUS_CONFIG.API_URL}/api/Usuario/getIntegrantes/${idCurso}`,
    COURSE_MODULES: (idCurso, parentId = 0) => `${EMINUS_CONFIG.API_URL}/api/Contenido/getUnidades/${idCurso}/${parentId}`,
    COURSE_EXAMS: (idCurso) => `${EMINUS_CONFIG.API_URL}/api/Examen/getExamenesEst/${idCurso}`
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

function formatProfessorName(member = {}) {
    const parts = [member.nombre, member.paterno, member.materno].filter(Boolean);
    if (parts.length > 0) {
        return parts.join(' ');
    }
    return member.nombreCompleto || 'Docente sin nombre';
}

function normalizeInfoType(rawValue = '') {
    const value = rawValue.toLowerCase();
    if (value.includes('prof')) return 'profesor';
    if (value.includes('mód') || value.includes('modul')) return 'modulos';
    if (value.includes('exam')) return 'examenes';
    if (value.includes('actividad') || value.includes('tarea')) return 'actividades';
    return null;
}

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de sesión
app.use(session({
    secret: 'eminus-session-secret-2025',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// -------- 1. Endpoint de login con formulario --------
app.get('/login', (req, res) => {
    const { redirect_uri, state, client_id } = req.query;
    res.render('login', { redirect_uri, state, client_id });
});

app.post('/auth', async (req, res) => {
    const { username, password, redirect_uri, state, client_id, remember } = req.body;
    
    try {
        // Guardar credenciales en sesión con duración extendida si se seleccionó "recordarme"
        const sessionDuration = remember ? 180 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 180 días o 24 horas
        
        req.session.credentials = { username, password };
        req.session.cookie.maxAge = sessionDuration;
        
        // Para Implicit Grant, necesitamos obtener el token real de Eminus primero
        const axios = require('axios');
        const response = await axios.post(EMINUS_ENDPOINTS.AUTH, { username, password });
        const accessToken = response.data.accessToken;
        
        // Redirigir con access_token en el hash (Implicit Grant)
        res.redirect(`${redirect_uri}#access_token=${accessToken}&token_type=Bearer&expires_in=3600&state=${state}`);
    } catch (error) {
        console.error('❌ Error en /auth:', error);
        res.status(500).json({ 
            error: 'server_error',
            error_description: 'Error al procesar credenciales'
        });
    }
});

// -------- 2. Endpoint de autenticación real (token endpoint) --------
app.post('/token', async (req, res) => {
    const { grant_type, code } = req.body;
    
    if (grant_type !== 'authorization_code' || !code) {
        return res.status(400).json({ 
            error: 'invalid_grant',
            error_description: 'Grant type o código inválido'
        });
    }

    try {
        // Decodificar credenciales del code
        const credentials = Buffer.from(code, 'base64').toString('utf-8');
        const [username, password] = credentials.split(':');
        
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'invalid_grant',
                error_description: 'Código inválido'
            });
        }

        // Llamada a la API de Eminus
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

// -------- 3. Página callback para OAuth --------
app.get('/callback', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'callback.html'));
});

// -------- 4. Página principal --------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------- 5. Endpoint de logout --------
app.post('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                console.error('❌ Error destruyendo sesión:', err);
                return res.status(500).json({ error: 'Error al cerrar sesión' });
            }
            res.clearCookie('connect.sid');
            res.json({ success: true, message: 'Sesión cerrada correctamente' });
        });
    } else {
        res.json({ success: true, message: 'No había sesión activa' });
    }
});

// -------- 6. Endpoint para verificar sesión --------
app.get('/session-status', (req, res) => {
    if (req.session && req.session.credentials) {
        res.json({ 
            authenticated: true, 
            username: req.session.credentials.username 
        });
    } else {
        res.json({ authenticated: false });
    }
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

// -------- 7. Alexa Skill Handlers --------

// Helper function para autenticación con Eminus (usando sesión)
async function authenticateWithEminus() {
    throw new Error('Use authenticateWithEminusSession(req) instead');
}

// Helper para autenticación usando credenciales de sesión
async function authenticateWithEminusSession(req) {
    if (!req.session || !req.session.credentials) {
        throw new Error('No hay credenciales guardadas en la sesión');
    }
    const axios = require('axios');
    const { username, password } = req.session.credentials;
    
    try {
        const response = await axios.post(EMINUS_ENDPOINTS.AUTH, { username, password });
        console.log(`✅ Autenticación exitosa con Eminus para usuario: ${username}`);
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

async function getCourseMembers(accessToken, idCurso) {
    const axios = require('axios');

    try {
        const response = await axios.get(EMINUS_ENDPOINTS.COURSE_MEMBERS(idCurso), {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        return response.data.contenido || response.data || [];
    } catch (error) {
        console.error('❌ Error obteniendo integrantes del curso:', error.response?.data || error.message);
        throw error;
    }
}

async function getCourseModules(accessToken, idCurso) {
    const axios = require('axios');

    try {
        const response = await axios.get(EMINUS_ENDPOINTS.COURSE_MODULES(idCurso), {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        return response.data.contenido || response.data || [];
    } catch (error) {
        console.error('❌ Error obteniendo módulos del curso:', error.response?.data || error.message);
        throw error;
    }
}

async function getCourseExams(accessToken, idCurso) {
    const axios = require('axios');

    try {
        const response = await axios.get(EMINUS_ENDPOINTS.COURSE_EXAMS(idCurso), {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        return response.data.contenido || response.data || [];
    } catch (error) {
        console.error('❌ Error obteniendo exámenes del curso:', error.response?.data || error.message);
        throw error;
    }
}

async function getPendingTasksForCourse(accessToken, idCurso, nombreCurso) {
    const tareas = [];
    const actividades = await getCourseActivities(accessToken, idCurso);

    for (const actividad of actividades) {
        const titulo = actividad.titulo || 'Actividad sin título';
        const fechaTermino = actividad.fechaTermino ?
            new Date(actividad.fechaTermino).toLocaleDateString('es-MX') :
            'sin fecha';
        const estadoAct = actividad.estadoAct || 0;
        const estadoEntrega = actividad.estadoEntrega;
        const estado = actividad.estado;

        console.log(`📝 [${nombreCurso}] Actividad: "${titulo}" - EstadoAct: ${estadoAct} - EstadoEntrega: ${estadoEntrega} - Estado: ${estado}`);

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

    return tareas;
}

async function buildPendingTasks(accessToken) {
    const cursosFavoritos = await getFavoriteCourses(accessToken);
    const tareas = [];

    for (const cursoData of cursosFavoritos) {
        const curso = cursoData.curso;
        const idCurso = curso.idCurso;
        const nombreCurso = curso.nombre;

        console.log(`🔍 Procesando curso: ${nombreCurso} (ID: ${idCurso})`);

        const tareasCurso = await getPendingTasksForCourse(accessToken, idCurso, nombreCurso);
        console.log(`📋 Tareas pendientes encontradas en ${nombreCurso}: ${tareasCurso.length}`);
        tareas.push(...tareasCurso);
    }

    return tareas;
}

// Handler para LaunchRequest (al abrir la skill)
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = "Bienvenido a Actividades Eminus. Puedes pedirme: Tareas pendientes o puedes preguntar por tus cursos favoritos y saber información específica sobre ellos.";
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

// Handler para listar cursos favoritos
const CursosFavoritosIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CursosFavoritosIntent';
    },
    async handle(handlerInput) {
        try {
            const accessToken = await authenticateWithEminus();
            const cursosFavoritos = await getFavoriteCourses(accessToken);

            const cursosEnumerados = (cursosFavoritos || [])
                .map((cursoData) => {
                    const curso = cursoData.curso || {};
                    return {
                        idCurso: curso.idCurso,
                        nombre: curso.nombre || 'Curso sin nombre'
                    };
                })
                .filter((curso) => curso.idCurso && curso.nombre);

            if (cursosEnumerados.length === 0) {
                return handlerInput.responseBuilder
                    .speak("No encontramos cursos favoritos activos en tu cuenta de Eminus.")
                    .reprompt("¿Quieres intentar otra consulta?")
                    .getResponse();
            }

            const cursosPresentados = cursosEnumerados.slice(0, 5);
            const cursosTexto = cursosPresentados.map((curso, idx) => `${idx + 1}.- ${curso.nombre}`);

            const attributes = handlerInput.attributesManager.getSessionAttributes();
            attributes.cursosFavoritosEnumerados = cursosPresentados;
            attributes.cursoSeleccionado = null;
            handlerInput.attributesManager.setSessionAttributes(attributes);

            const speakOutput = `Tus cursos favoritos son: ${cursosTexto.join('. ')}. ¿Quieres detalles de alguno? Dime el número.`;

            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt("Dime el número del curso que quieres revisar." )
                .getResponse();
        } catch (error) {
            console.error('❌ Error listando cursos favoritos:', error.response?.data || error.message);
            return handlerInput.responseBuilder
                .speak("No pude obtener tus cursos favoritos en este momento. Intenta más tarde.")
                .reprompt("¿Quieres intentar otra consulta?")
                .getResponse();
        }
    }
};

// Handler para seleccionar un curso por número
const SeleccionarCursoIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SeleccionCursoIntent';
    },
    handle(handlerInput) {
        const numeroCurso = handlerInput.requestEnvelope.request.intent.slots?.numeroCurso?.value;
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const cursos = attributes.cursosFavoritosEnumerados || [];

        if (!numeroCurso || cursos.length === 0) {
            return handlerInput.responseBuilder
                .speak("Primero pídeme tus cursos favoritos y luego dime el número que quieres revisar.")
                .reprompt("Puedes decir: Alexa, dime mis cursos favoritos.")
                .getResponse();
        }

        const index = parseInt(numeroCurso, 10) - 1;

        if (Number.isNaN(index) || index < 0 || index >= cursos.length) {
            return handlerInput.responseBuilder
                .speak(`No encontré el curso número ${numeroCurso}. Intenta con otro número de la lista.`)
                .reprompt("Dime otro número de curso que aparezca en la lista.")
                .getResponse();
        }

        const cursoSeleccionado = cursos[index];
        attributes.cursoSeleccionado = cursoSeleccionado;
        handlerInput.attributesManager.setSessionAttributes(attributes);

        const speakOutput = `Seleccionaste ${cursoSeleccionado.nombre}. ¿Quieres saber las actividades pendientes, el nombre del profesor, los módulos o tus calificaciones de exámenes?`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("Puedes decir profesor, módulos, exámenes o actividades para este curso.")
            .getResponse();
    }
};

// Handler para obtener información específica del curso seleccionado
const InfoCursoIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'InfoCursoIntent';
    },
    async handle(handlerInput) {
        const intent = handlerInput.requestEnvelope.request.intent;
        const infoSlotValue = intent.slots?.tipoInformacion?.value;
        const numeroCursoSlot = intent.slots?.numeroCurso?.value;

        const infoType = normalizeInfoType(infoSlotValue || '');
        if (!infoType) {
            return handlerInput.responseBuilder
                .speak("No entendí qué información del curso necesitas. Puedes decir profesor, módulos, exámenes o actividades.")
                .reprompt("Dime si quieres profesor, módulos, exámenes o actividades.")
                .getResponse();
        }

        const attributes = handlerInput.attributesManager.getSessionAttributes();
        let cursoSeleccionado = attributes.cursoSeleccionado;
        let cursosEnumerados = attributes.cursosFavoritosEnumerados || [];

        if ((!cursoSeleccionado || !cursoSeleccionado.idCurso) && numeroCursoSlot) {
            const index = parseInt(numeroCursoSlot, 10) - 1;
            if (!Number.isNaN(index) && index >= 0 && index < cursosEnumerados.length) {
                cursoSeleccionado = cursosEnumerados[index];
                attributes.cursoSeleccionado = cursoSeleccionado;
            }
        }

        if (!cursoSeleccionado || !cursoSeleccionado.idCurso) {
            return handlerInput.responseBuilder
                .speak("Primero dime qué curso quieres revisar. Puedes decir el número de la lista de cursos favoritos.")
                .reprompt("Dime el número del curso que quieres revisar.")
                .getResponse();
        }

        try {
            const accessToken = await authenticateWithEminus();
            let respuestaDetalle = '';

            if (infoType === 'profesor') {
                const miembros = await getCourseMembers(accessToken, cursoSeleccionado.idCurso);
                const facilitadores = miembros.filter((integrante) => (integrante.tipoPerfil || '').toLowerCase() === 'facilitador');

                if (facilitadores.length === 0) {
                    respuestaDetalle = `No encontré docentes registrados para ${cursoSeleccionado.nombre}.`;
                } else {
                    const nombres = facilitadores.map(formatProfessorName);
                    respuestaDetalle = `El profesor${nombres.length > 1 ? 'es' : ''} de ${cursoSeleccionado.nombre} ${nombres.length > 1 ? 'son' : 'es'}: ${nombres.join(', ')}.`;
                }
            } else if (infoType === 'modulos') {
                const modulos = await getCourseModules(accessToken, cursoSeleccionado.idCurso);
                if (!modulos || modulos.length === 0) {
                    respuestaDetalle = `Este curso aún no tiene módulos publicados.`;
                } else {
                    const modulosTexto = modulos.slice(0, 5).map((modulo) => {
                        const nombre = modulo.nombre || 'Módulo sin nombre';
                        const totalElementos = modulo.totalElementos != null ? modulo.totalElementos : 0;
                        return `${nombre} con ${totalElementos} elementos`;
                    });
                    respuestaDetalle = `Los primeros módulos de ${cursoSeleccionado.nombre} son: ${modulosTexto.join('. ')}.`;
                }
            } else if (infoType === 'examenes') {
                const examenes = await getCourseExams(accessToken, cursoSeleccionado.idCurso);
                if (!examenes || examenes.length === 0) {
                    respuestaDetalle = `No encontré exámenes registrados para ${cursoSeleccionado.nombre}.`;
                } else {
                    const examenesTexto = examenes.slice(0, 3).map((examen) => {
                        const titulo = examen.titulo || 'Examen sin título';
                        const calificacion = examen.calificacion != null ? `${examen.calificacion}` : 'sin calificación aún';
                        const totalPreguntas = examen.totalPreguntas != null ? examen.totalPreguntas : 'un número desconocido de';
                        return `${titulo}, calificación ${calificacion}, con ${totalPreguntas} preguntas`;
                    });
                    respuestaDetalle = `Tus exámenes recientes son: ${examenesTexto.join('. ')}.`;
                }
            } else if (infoType === 'actividades') {
                const tareas = await getPendingTasksForCourse(accessToken, cursoSeleccionado.idCurso, cursoSeleccionado.nombre);
                if (!tareas || tareas.length === 0) {
                    respuestaDetalle = `No tienes actividades pendientes en ${cursoSeleccionado.nombre}.`;
                } else {
                    const tareasTexto = tareas.slice(0, 5).map((tarea, idx) => `${idx + 1}.- ${tarea.displayText}`);
                    respuestaDetalle = `Las actividades pendientes en ${cursoSeleccionado.nombre} son: ${tareasTexto.join('. ')}.`;
                }
            }

            attributes.cursoSeleccionado = cursoSeleccionado;
            handlerInput.attributesManager.setSessionAttributes(attributes);

            const followUp = `¿Quieres saber algo más? Puedes decir profesor, módulos, exámenes o actividades, o di salir para terminar.`;
            const speakOutput = `${respuestaDetalle} ${followUp}`;

            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(`Dime si quieres profesor, módulos, exámenes o actividades del curso.`)
                .getResponse();
        } catch (error) {
            console.error('❌ Error obteniendo información del curso:', error.response?.data || error.message);
            return handlerInput.responseBuilder
                .speak("No pude obtener esa información del curso. Intenta nuevamente en unos minutos.")
                .reprompt("¿Quieres intentar con otro tipo de información?")
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
    CursosFavoritosIntentHandler,
    SeleccionarCursoIntentHandler,
    InfoCursoIntentHandler,
    TareasPendientesIntentHandler,
    DetallesTareaIntentHandler,
    FallbackHandler // SIEMPRE AL FINAL
)
.create();

// -------- 8. Endpoint de la skill que Alexa invoca --------
app.post('/skill', (req, res) => {
    console.log("[IN] Pedido Alexa:", JSON.stringify(req.body, null, 2));
    
    // Para compatibilidad temporal, usamos credenciales hardcodeadas si no hay sesión
    const tempReq = Object.assign({}, req, {
        session: req.session || { credentials: { username: EMINUS_CONFIG.USERNAME, password: EMINUS_CONFIG.PASSWORD } }
    });
    
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
