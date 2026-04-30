import type { CircuitComponent, Wire, BoardId } from "@/sim/types";

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  boardId: BoardId;
  code: string;
  components: CircuitComponent[];
  wires: Wire[];
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "blink",
    name: "Blink LED",
    description: "Classic Arduino hello world. Blinks an LED on pin 13.",
    boardId: "uno",
    code: `void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(13, HIGH);
  Serial.println("ON");
  delay(500);
  digitalWrite(13, LOW);
  Serial.println("OFF");
  delay(500);
}
`,
    components: [
      { id: "led1", kind: "led", x: 540, y: 130, rotation: 0, props: { color: "red" } },
      { id: "r1", kind: "resistor", x: 520, y: 240, rotation: 0, props: { ohms: 220 } },
    ],
    wires: [
      { id: "w1", from: { componentId: "board", pinId: "D13" }, to: { componentId: "led1", pinId: "A" } },
      { id: "w2", from: { componentId: "led1", pinId: "K" }, to: { componentId: "r1", pinId: "1" } },
      { id: "w3", from: { componentId: "r1", pinId: "2" }, to: { componentId: "board", pinId: "GND_TOP" } },
    ],
  },
  {
    id: "button-led",
    name: "Button + LED",
    description: "Press the button to light up the LED.",
    boardId: "uno",
    code: `void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int v = digitalRead(2);
  digitalWrite(13, v == 0 ? 1 : 0);
  Serial.println(v);
  delay(50);
}
`,
    components: [
      { id: "led1", kind: "led", x: 560, y: 130, rotation: 0, props: { color: "green" } },
      { id: "r1", kind: "resistor", x: 540, y: 240, rotation: 0, props: { ohms: 220 } },
      { id: "btn1", kind: "button", x: 200, y: 360, rotation: 0, props: {} },
    ],
    wires: [
      { id: "w1", from: { componentId: "board", pinId: "D13" }, to: { componentId: "led1", pinId: "A" } },
      { id: "w2", from: { componentId: "led1", pinId: "K" }, to: { componentId: "r1", pinId: "1" } },
      { id: "w3", from: { componentId: "r1", pinId: "2" }, to: { componentId: "board", pinId: "GND_TOP" } },
      { id: "w4", from: { componentId: "board", pinId: "D2" }, to: { componentId: "btn1", pinId: "A" } },
      { id: "w5", from: { componentId: "btn1", pinId: "B" }, to: { componentId: "board", pinId: "GND1" } },
    ],
  },
  {
    id: "pot-serial",
    name: "Potentiometer + Serial",
    description: "Read a potentiometer and print the value to serial.",
    boardId: "uno",
    code: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int v = analogRead(A0);
  Serial.print("A0 = ");
  Serial.println(v);
  delay(200);
}
`,
    components: [
      { id: "pot1", kind: "potentiometer", x: 200, y: 360, rotation: 0, props: { value: 512 } },
    ],
    wires: [
      { id: "w1", from: { componentId: "pot1", pinId: "1" }, to: { componentId: "board", pinId: "GND1" } },
      { id: "w2", from: { componentId: "pot1", pinId: "2" }, to: { componentId: "board", pinId: "5V" } },
      { id: "w3", from: { componentId: "pot1", pinId: "W" }, to: { componentId: "board", pinId: "A0" } },
    ],
  },
  {
    id: "fade",
    name: "PWM Fade",
    description: "Fade an LED in and out with analogWrite (PWM).",
    boardId: "uno",
    code: `int v = 0;
int dir = 5;
void setup() { pinMode(9, OUTPUT); }
void loop() {
  analogWrite(9, v);
  v = v + dir;
  if (v >= 255 || v <= 0) dir = -dir;
  delay(30);
}
`,
    components: [
      { id: "led1", kind: "led", x: 360, y: 130, rotation: 0, props: { color: "blue" } },
      { id: "r1", kind: "resistor", x: 340, y: 240, rotation: 0, props: { ohms: 220 } },
    ],
    wires: [
      { id: "w1", from: { componentId: "board", pinId: "D9" }, to: { componentId: "led1", pinId: "A" } },
      { id: "w2", from: { componentId: "led1", pinId: "K" }, to: { componentId: "r1", pinId: "1" } },
      { id: "w3", from: { componentId: "r1", pinId: "2" }, to: { componentId: "board", pinId: "GND_TOP" } },
    ],
  },
];
