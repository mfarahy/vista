import type { BorisEnrichment } from "./expose-data.js";
import { fetchBorisEnrichment } from "../external-services/boris.js";
import type { Coordinates } from "../external-services/location.js";

/**
 * Optional address enrichment backed by Brandenburg BORIS.
 *
 * BORIS is never a hard dependency: `enrichAddressWithBoris` returns `null` for any
 * unavailable/error case so the caller can continue the normal address flow.
 */
export async function enrichAddressWithBoris(coordinates: Coordinates): Promise<BorisEnrichment | null> {
  return fetchBorisEnrichment(coordinates);
}

export { borisCoversCoordinates } from "../external-services/boris.js";
