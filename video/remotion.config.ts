// Configuración de Remotion (video del proyecto). Los medios se sirven desde public/, que `npm run preparar` arma
// con junctions a clips/ y audio/: así el Studio no expone el resto de video/ (por ejemplo el .env).
import { Config } from '@remotion/cli/config';

// Remotion carga por defecto video/.env y lo inyecta en la página del Studio (que escucha en toda la red local): ahí
// está la key de ElevenLabs. Se lo apunta a remotion.env, sin secretos.
Config.setDotEnvLocation('remotion.env');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
