import type { TenantRole } from './tenant';

/**
 * Privilege order for tenant roles. A smaller value means more privilege.
 * `superadmin` is intentionally not a TenantRole: platform access is separate
 * from tenant membership and must never be assignable through members APIs.
 */
const ROLE_RANK: Readonly<Record<TenantRole, number>> = {
  owner: 0,
  admin: 10,
  gerente: 20,
  jefe: 25,
  supervisor_sucursal: 30,
  vendedor: 40,
  cajero: 40,
  bodega: 40,
  compras: 40,
  chofer: 40,
  despachador: 40,
  solo_lectura: 50,
};

/**
 * Returns whether an actor may assign `newRole` to `targetRole`.
 *
 * The actor must outrank both the target's current role and the role being
 * assigned. Owners can manage every non-owner tenant role. No tenant role can
 * assign owner or platform-level superadmin access.
 */
export function canManageRole(
  actorRole: TenantRole,
  targetRole: TenantRole,
  newRole: TenantRole,
): boolean {
  if (newRole === 'owner' || actorRole === 'owner' && targetRole === 'owner') return false;

  const actorRank = ROLE_RANK[actorRole];
  const targetRank = ROLE_RANK[targetRole];
  const newRoleRank = ROLE_RANK[newRole];

  if ([actorRank, targetRank, newRoleRank].some((rank) => typeof rank !== 'number')) return false;
  if (actorRole === 'owner') return targetRole !== 'owner';
  return actorRank < targetRank && actorRank < newRoleRank;
}

/** Returns whether an actor may invite a new member with `newRole`. */
export function canAssignRole(actorRole: TenantRole, newRole: TenantRole): boolean {
  if (newRole === 'owner') return false;
  const actorRank = ROLE_RANK[actorRole];
  const newRoleRank = ROLE_RANK[newRole];
  if (typeof actorRank !== 'number' || typeof newRoleRank !== 'number') return false;
  return actorRole === 'owner' || actorRank < newRoleRank;
}
