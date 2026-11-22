const bindings = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], handbrake: ['Space'],
};

export function readDrivingInput(keys, touches = new Set(), reverseHeld = false) {
  const held = (action) => bindings[action].some((code) => keys.has(code)) || touches.has(action);
  const throttle = Number(held('throttle'));
  const stop = Number(held('brake'));
  const steer = Number(held('right')) - Number(held('left'));
  const handbrake = held('handbrake');
  return { throttle, brake: reverseHeld ? 0 : stop, reverse: reverseHeld ? stop : 0,
    steer, handbrake, manual: !!(throttle || stop || steer || handbrake) };
}
