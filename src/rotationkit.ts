// Rotationkit deep links. Rotationkit shows its own "not available yet" page for games it can't show.

import { ROTATIONKIT_BASE_URL } from './config';

export const rotationkitUrl = (gameId: string, base = ROTATIONKIT_BASE_URL) => `${base.replace(/\/+$/, '')}/?game=${encodeURIComponent(gameId)}`;
