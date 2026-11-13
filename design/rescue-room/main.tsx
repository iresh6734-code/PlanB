import { createRoot } from 'react-dom/client';
import RescueRoom from '../../src/RescueRoom.js';
// Demo aislada de la Sala de rescate. No se importa desde App/TeamApp ni forma parte de la navegación del producto.
createRoot(document.getElementById('root')!).render(<RescueRoom />);
