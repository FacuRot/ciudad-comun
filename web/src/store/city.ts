import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Barrio, City, Construction, Inventory, Lot, Player, PlayerPublic, PublicWork } from '../types/game';

export type CitySnapshot = {
  city: City;
  lots: Lot[];
  barrios: Barrio[];
  works: PublicWork[];
  constructions: Construction[];
  players: PlayerPublic[];
};

type CityState = {
  session: Session | null;
  authReady: boolean;
  me: Player | null; // null: sin jugador todavía
  inventory: Inventory | null;
  meReady: boolean;
  snapshot: CitySnapshot | null;
  setSession: (session: Session | null) => void;
  setMe: (me: Player | null, inventory: Inventory | null) => void;
  setSnapshot: (snapshot: CitySnapshot) => void;
  applyLot: (lot: Lot) => void;
};

export const useCity = create<CityState>((set) => ({
  session: null,
  authReady: false,
  me: null,
  inventory: null,
  meReady: false,
  snapshot: null,

  // Solo se descarta el jugador cargado si cambió el usuario (no en cada refresco de token).
  setSession: (session) =>
    set((s) =>
      s.session?.user.id === session?.user.id
        ? { session, authReady: true }
        : { session, authReady: true, me: null, inventory: null, meReady: false },
    ),
  setMe: (me, inventory) => set({ me, inventory, meReady: true }),
  setSnapshot: (snapshot) => set({ snapshot }),
  applyLot: (lot) =>
    set((s) =>
      s.snapshot ? { snapshot: { ...s.snapshot, lots: s.snapshot.lots.map((l) => (l.id === lot.id ? lot : l)) } } : {},
    ),
}));
