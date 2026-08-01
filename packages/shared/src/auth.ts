import { z } from 'zod';

/** Matches the CHECK constraint on `users.username` (DESIGN.md §7). */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * DESIGN.md §9.1: minimum ten characters, maximum two hundred. Length beats composition
 * rules, and the upper bound exists so nobody can DoS us by asking Argon2 to hash a
 * megabyte.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export const Username = z
  .string()
  .regex(USERNAME_PATTERN, 'Usernames are 3–20 letters, numbers, or underscores.');

export const Password = z
  .string()
  .min(PASSWORD_MIN, `Passwords must be at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Passwords must be at most ${PASSWORD_MAX} characters.`);

export const BeanName = z.string().trim().min(1, 'Your Jelly Bean needs a name.').max(24);

/**
 * Baby mode (§5.11) is chosen at creation and is immutable thereafter. The API accepts it
 * from Phase 0 because the column exists; the rules that make it *harder* land in Phase 7.
 */
export const PlayMode = z.enum(['regular', 'baby']);
export type PlayMode = z.infer<typeof PlayMode>;

// There is deliberately no email field anywhere below. Canon has none, the game asks for
// none, and not holding email is a smaller breach (§9.1). The consequence — no password
// reset — is stated plainly on the registration screen.

export const RegisterBody = z.object({
  username: Username,
  password: Password,
  beanName: BeanName,
  mode: PlayMode.default('regular'),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  username: Username,
  password: z.string().max(PASSWORD_MAX),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const ChangePasswordBody = z.object({
  currentPassword: z.string().max(PASSWORD_MAX),
  newPassword: Password,
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>;

export const PlayerSummary = z.object({
  id: z.uuid(),
  slot: z.number().int(),
  mode: PlayMode,
  beanName: z.string(),
  level: z.number().int(),
  stage: z.string(),
});
export type PlayerSummary = z.infer<typeof PlayerSummary>;

export const MeResponse = z.object({
  user: z.object({
    id: z.uuid(),
    username: z.string(),
    createdAt: z.string(),
  }),
  players: z.array(PlayerSummary),
});
export type MeResponse = z.infer<typeof MeResponse>;
