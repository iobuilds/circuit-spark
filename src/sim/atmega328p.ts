// ATmega328P register / pin map. Values mirror Atmel-42735 datasheet so the
// chip-inspector UI can show the same register names and addresses a real
// developer would look up while debugging.

export interface RegSpec {
  name: string;
  /** I/O space address (datasheet "Addr" column, hex). */
  addr: number;
  /** Where to read it from inside the avr8js Data memory. SRAM offset = 0x20 + ioAddr for I/O regs. */
  sramOffset: number;
  group: "PORT" | "TIMER" | "USART" | "SPI" | "TWI" | "ADC" | "EEPROM" | "MISC";
  /** Per-bit names, bit 7 → bit 0. */
  bits?: [string, string, string, string, string, string, string, string];
  desc?: string;
}

const io = (ioAddr: number) => 0x20 + ioAddr;

export const ATMEGA328P_REGS: RegSpec[] = [
  // PORTB / DDRB / PINB
  { name: "PINB",  addr: 0x03, sramOffset: io(0x03), group: "PORT",
    bits: ["PINB7","PINB6","PINB5","PINB4","PINB3","PINB2","PINB1","PINB0"],
    desc: "Port B Input Pins" },
  { name: "DDRB",  addr: 0x04, sramOffset: io(0x04), group: "PORT",
    bits: ["DDB7","DDB6","DDB5","DDB4","DDB3","DDB2","DDB1","DDB0"],
    desc: "Port B Data Direction" },
  { name: "PORTB", addr: 0x05, sramOffset: io(0x05), group: "PORT",
    bits: ["PORTB7","PORTB6","PORTB5","PORTB4","PORTB3","PORTB2","PORTB1","PORTB0"],
    desc: "Port B Data" },
  // PORTC / DDRC / PINC
  { name: "PINC",  addr: 0x06, sramOffset: io(0x06), group: "PORT",
    bits: ["-","PINC6","PINC5","PINC4","PINC3","PINC2","PINC1","PINC0"],
    desc: "Port C Input Pins" },
  { name: "DDRC",  addr: 0x07, sramOffset: io(0x07), group: "PORT",
    bits: ["-","DDC6","DDC5","DDC4","DDC3","DDC2","DDC1","DDC0"],
    desc: "Port C Data Direction" },
  { name: "PORTC", addr: 0x08, sramOffset: io(0x08), group: "PORT",
    bits: ["-","PORTC6","PORTC5","PORTC4","PORTC3","PORTC2","PORTC1","PORTC0"],
    desc: "Port C Data" },
  // PORTD / DDRD / PIND
  { name: "PIND",  addr: 0x09, sramOffset: io(0x09), group: "PORT",
    bits: ["PIND7","PIND6","PIND5","PIND4","PIND3","PIND2","PIND1","PIND0"],
    desc: "Port D Input Pins" },
  { name: "DDRD",  addr: 0x0A, sramOffset: io(0x0A), group: "PORT",
    bits: ["DDD7","DDD6","DDD5","DDD4","DDD3","DDD2","DDD1","DDD0"],
    desc: "Port D Data Direction" },
  { name: "PORTD", addr: 0x0B, sramOffset: io(0x0B), group: "PORT",
    bits: ["PORTD7","PORTD6","PORTD5","PORTD4","PORTD3","PORTD2","PORTD1","PORTD0"],
    desc: "Port D Data" },

  // Timer/Counter 0
  { name: "TCCR0A", addr: 0x24, sramOffset: io(0x24), group: "TIMER", desc: "Timer/Counter 0 Control A" },
  { name: "TCCR0B", addr: 0x25, sramOffset: io(0x25), group: "TIMER", desc: "Timer/Counter 0 Control B" },
  { name: "TCNT0",  addr: 0x26, sramOffset: io(0x26), group: "TIMER", desc: "Timer/Counter 0" },
  { name: "OCR0A",  addr: 0x27, sramOffset: io(0x27), group: "TIMER", desc: "Output Compare 0 A" },
  { name: "OCR0B",  addr: 0x28, sramOffset: io(0x28), group: "TIMER", desc: "Output Compare 0 B" },
  { name: "TIMSK0", addr: 0x6E, sramOffset: 0x6E, group: "TIMER", desc: "Timer 0 Interrupt Mask" },

  // Timer/Counter 1 (16-bit)
  { name: "TCCR1A", addr: 0x80, sramOffset: 0x80, group: "TIMER", desc: "Timer/Counter 1 Control A" },
  { name: "TCCR1B", addr: 0x81, sramOffset: 0x81, group: "TIMER", desc: "Timer/Counter 1 Control B" },
  { name: "TCNT1L", addr: 0x84, sramOffset: 0x84, group: "TIMER", desc: "Timer/Counter 1 Low" },
  { name: "TCNT1H", addr: 0x85, sramOffset: 0x85, group: "TIMER", desc: "Timer/Counter 1 High" },
  { name: "OCR1AL", addr: 0x88, sramOffset: 0x88, group: "TIMER", desc: "Output Compare 1 A Low" },
  { name: "OCR1AH", addr: 0x89, sramOffset: 0x89, group: "TIMER", desc: "Output Compare 1 A High" },
  { name: "TIMSK1", addr: 0x6F, sramOffset: 0x6F, group: "TIMER", desc: "Timer 1 Interrupt Mask" },

  // USART0
  { name: "UCSR0A", addr: 0xC0, sramOffset: 0xC0, group: "USART",
    bits: ["RXC0","TXC0","UDRE0","FE0","DOR0","UPE0","U2X0","MPCM0"],
    desc: "USART Status A" },
  { name: "UCSR0B", addr: 0xC1, sramOffset: 0xC1, group: "USART",
    bits: ["RXCIE0","TXCIE0","UDRIE0","RXEN0","TXEN0","UCSZ02","RXB80","TXB80"],
    desc: "USART Control B" },
  { name: "UCSR0C", addr: 0xC2, sramOffset: 0xC2, group: "USART", desc: "USART Control C" },
  { name: "UBRR0L", addr: 0xC4, sramOffset: 0xC4, group: "USART", desc: "USART Baud Rate Low" },
  { name: "UBRR0H", addr: 0xC5, sramOffset: 0xC5, group: "USART", desc: "USART Baud Rate High" },
  { name: "UDR0",   addr: 0xC6, sramOffset: 0xC6, group: "USART", desc: "USART Data" },

  // SPI
  { name: "SPCR",   addr: 0x2C, sramOffset: io(0x2C), group: "SPI",
    bits: ["SPIE","SPE","DORD","MSTR","CPOL","CPHA","SPR1","SPR0"],
    desc: "SPI Control" },
  { name: "SPSR",   addr: 0x2D, sramOffset: io(0x2D), group: "SPI", desc: "SPI Status" },
  { name: "SPDR",   addr: 0x2E, sramOffset: io(0x2E), group: "SPI", desc: "SPI Data" },

  // TWI / I2C
  { name: "TWBR",  addr: 0xB8, sramOffset: 0xB8, group: "TWI", desc: "TWI Bit Rate" },
  { name: "TWSR",  addr: 0xB9, sramOffset: 0xB9, group: "TWI", desc: "TWI Status" },
  { name: "TWAR",  addr: 0xBA, sramOffset: 0xBA, group: "TWI", desc: "TWI Address" },
  { name: "TWDR",  addr: 0xBB, sramOffset: 0xBB, group: "TWI", desc: "TWI Data" },
  { name: "TWCR",  addr: 0xBC, sramOffset: 0xBC, group: "TWI",
    bits: ["TWINT","TWEA","TWSTA","TWSTO","TWWC","TWEN","-","TWIE"],
    desc: "TWI Control" },

  // ADC
  { name: "ADMUX",  addr: 0x7C, sramOffset: 0x7C, group: "ADC",
    bits: ["REFS1","REFS0","ADLAR","-","MUX3","MUX2","MUX1","MUX0"],
    desc: "ADC Multiplexer Selection" },
  { name: "ADCSRA", addr: 0x7A, sramOffset: 0x7A, group: "ADC",
    bits: ["ADEN","ADSC","ADATE","ADIF","ADIE","ADPS2","ADPS1","ADPS0"],
    desc: "ADC Control & Status A" },
  { name: "ADCL",   addr: 0x78, sramOffset: 0x78, group: "ADC", desc: "ADC Result Low" },
  { name: "ADCH",   addr: 0x79, sramOffset: 0x79, group: "ADC", desc: "ADC Result High" },

  // EEPROM
  { name: "EECR",  addr: 0x1F, sramOffset: io(0x1F), group: "EEPROM",
    bits: ["-","-","EEPM1","EEPM0","EERIE","EEMPE","EEPE","EERE"],
    desc: "EEPROM Control" },
  { name: "EEDR",  addr: 0x20, sramOffset: io(0x20), group: "EEPROM", desc: "EEPROM Data" },
  { name: "EEARL", addr: 0x21, sramOffset: io(0x21), group: "EEPROM", desc: "EEPROM Address Low" },
  { name: "EEARH", addr: 0x22, sramOffset: io(0x22), group: "EEPROM", desc: "EEPROM Address High" },

  // Status / stack
  { name: "SREG", addr: 0x3F, sramOffset: io(0x3F), group: "MISC",
    bits: ["I","T","H","S","V","N","Z","C"],
    desc: "Status Register" },
  { name: "SPL",  addr: 0x3D, sramOffset: io(0x3D), group: "MISC", desc: "Stack Pointer Low" },
  { name: "SPH",  addr: 0x3E, sramOffset: io(0x3E), group: "MISC", desc: "Stack Pointer High" },
];

/** Maps Arduino digital pin number → AVR (port, bit). */
export const ARDUINO_TO_AVR: Record<number, { port: "B" | "C" | "D"; bit: number }> = {
  0: { port: "D", bit: 0 }, 1: { port: "D", bit: 1 }, 2: { port: "D", bit: 2 },
  3: { port: "D", bit: 3 }, 4: { port: "D", bit: 4 }, 5: { port: "D", bit: 5 },
  6: { port: "D", bit: 6 }, 7: { port: "D", bit: 7 },
  8: { port: "B", bit: 0 }, 9: { port: "B", bit: 1 }, 10: { port: "B", bit: 2 },
  11: { port: "B", bit: 3 }, 12: { port: "B", bit: 4 }, 13: { port: "B", bit: 5 },
  // A0..A5 → PORTC 0..5
  14: { port: "C", bit: 0 }, 15: { port: "C", bit: 1 }, 16: { port: "C", bit: 2 },
  17: { port: "C", bit: 3 }, 18: { port: "C", bit: 4 }, 19: { port: "C", bit: 5 },
};

/** Datasheet 28-pin DIP pinout, top view (pin 1 top-left, counter-clockwise). */
export const ATMEGA328P_DIP_PINS: { num: number; label: string; alt?: string }[] = [
  { num: 1,  label: "PC6/RESET" },
  { num: 2,  label: "PD0", alt: "RXD / D0" },
  { num: 3,  label: "PD1", alt: "TXD / D1" },
  { num: 4,  label: "PD2", alt: "INT0 / D2" },
  { num: 5,  label: "PD3", alt: "INT1 / OC2B / D3" },
  { num: 6,  label: "PD4", alt: "T0 / D4" },
  { num: 7,  label: "VCC" },
  { num: 8,  label: "GND" },
  { num: 9,  label: "PB6", alt: "XTAL1" },
  { num: 10, label: "PB7", alt: "XTAL2" },
  { num: 11, label: "PD5", alt: "OC0B / T1 / D5" },
  { num: 12, label: "PD6", alt: "OC0A / AIN0 / D6" },
  { num: 13, label: "PD7", alt: "AIN1 / D7" },
  { num: 14, label: "PB0", alt: "ICP1 / D8" },
  { num: 15, label: "PB1", alt: "OC1A / D9" },
  { num: 16, label: "PB2", alt: "OC1B / SS / D10" },
  { num: 17, label: "PB3", alt: "MOSI / OC2A / D11" },
  { num: 18, label: "PB4", alt: "MISO / D12" },
  { num: 19, label: "PB5", alt: "SCK / D13" },
  { num: 20, label: "AVCC" },
  { num: 21, label: "AREF" },
  { num: 22, label: "GND" },
  { num: 23, label: "PC0", alt: "ADC0 / A0" },
  { num: 24, label: "PC1", alt: "ADC1 / A1" },
  { num: 25, label: "PC2", alt: "ADC2 / A2" },
  { num: 26, label: "PC3", alt: "ADC3 / A3" },
  { num: 27, label: "PC4", alt: "ADC4 / SDA / A4" },
  { num: 28, label: "PC5", alt: "ADC5 / SCL / A5" },
];

/**
 * Build a synthetic SRAM image from currently observed Arduino pin states.
 * This is the "behavioral" path used while we don't have a real avr8js CPU
 * tick — it lets the inspector show plausible PORTx / DDRx / PINx values that
 * match what `digitalWrite/pinMode` would produce on real hardware.
 *
 * Returns a 0x8FF-byte (2304) Uint8Array — large enough to cover all I/O
 * registers and the start of SRAM. Real ATmega328P data space is 0x100..0x8FF
 * for SRAM proper.
 */
export function synthesizeSramFromPins(
  pinStates: Record<number, { mode: string; digital: 0 | 1; analog: number }>,
): Uint8Array {
  const sram = new Uint8Array(0x900);
  for (const [pinStr, ps] of Object.entries(pinStates)) {
    const pin = Number(pinStr);
    const map = ARDUINO_TO_AVR[pin];
    if (!map) continue;
    const ddrAddr = map.port === "B" ? io(0x04) : map.port === "C" ? io(0x07) : io(0x0A);
    const portAddr = ddrAddr + 1;
    const pinAddr = ddrAddr - 1;
    if (ps.mode === "OUTPUT") sram[ddrAddr] |= 1 << map.bit;
    if (ps.digital === 1) {
      sram[portAddr] |= 1 << map.bit;
      sram[pinAddr]  |= 1 << map.bit;
    }
    if (ps.mode === "INPUT_PULLUP") sram[portAddr] |= 1 << map.bit;
  }
  // SREG: I bit (bit 7) typically set when interrupts enabled.
  sram[io(0x3F)] = 0x80;
  // Stack pointer initial value RAMEND = 0x08FF.
  sram[io(0x3D)] = 0xFF;
  sram[io(0x3E)] = 0x08;
  return sram;
}
