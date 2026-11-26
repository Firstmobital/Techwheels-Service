export const rupees = (paise: number) => `${paise < 0 ? '− ' : ''}Rs. ${Math.abs(Math.round(paise / 100)).toLocaleString('en-IN')}`
