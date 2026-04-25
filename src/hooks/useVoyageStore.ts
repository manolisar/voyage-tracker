import { useContext } from 'react';
import {
  VoyageStoreContext,
  type VoyageStoreContextValue,
} from '../contexts/VoyageStoreContext';

export function useVoyageStore(): VoyageStoreContextValue {
  const ctx = useContext(VoyageStoreContext);
  if (!ctx) throw new Error('useVoyageStore must be used within <VoyageStoreProvider>');
  return ctx;
}
