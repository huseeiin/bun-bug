async function func() {
  return "hello";
}

const hello = await func();

export function load() {
  return { hello };
}
