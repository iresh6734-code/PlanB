import { createRoot } from 'react-dom/client';
import RescueCapsule from '../../src/RescueCapsule.js';
// Demo aislada del Kit de relevo. No se importa desde App/TeamApp ni forma parte de la navegación del producto.
createRoot(document.getElementById('root')!).render(<RescueCapsule />);
