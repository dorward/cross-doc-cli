import { defineConfig } from 'vitest/config';

// Fixture YAML dates and Moment rendering use a stable test timezone.
process.env.TZ = 'UTC';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.mjs'],
		restoreMocks: true,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			reporter: ['text', 'html'],
		},
	},
});
