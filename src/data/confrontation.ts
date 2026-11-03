export type ConfColor = 'amarillo' | 'rojo' | 'gris';

export const CONF_COLORS: ConfColor[] = ['amarillo', 'rojo', 'gris'];

export const OCTO_CONFRONTATION: Record<ConfColor, { name: string; text: string }> = {
  amarillo: { name: 'Huir', text: 'Baraja el pulpo y hasta 2 bloques ocultos más' },
  rojo: { name: 'Luchar', text: 'El tiburón vuelve a una guarida (eliges tú) y pierde 1 corriente' },
  gris: { name: 'Entintar', text: 'Oculta todos tus bloques' },
};

export const SHARK_CONFRONTATION: Record<ConfColor, { name: string; text: string }> = {
  amarillo: { name: 'Perseguir', text: 'Contrarresta «Huir»' },
  rojo: { name: 'Morder', text: 'Contrarresta «Luchar»' },
  gris: { name: 'Olfatear', text: 'Contrarresta «Entintar»' },
};
