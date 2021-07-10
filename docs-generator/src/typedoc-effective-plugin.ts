import {
  Application,
  Converter,
  DeclarationReflection,
  ReflectionKind,
} from "typedoc";
import { Context } from "typedoc/dist/lib/converter";
import { ReflectionGroup } from "typedoc/dist/lib/models";

export function load(app: Application) {
  app.converter.on(Converter.EVENT_END, (context: Context) => {
    const project = context.project;
    const IO = project.getChildByName("IO") as DeclarationReflection;

    // Remove private "_setTimeout" function
    const _setTimeout = IO?.getChildByName("_setTimeout");
    if (_setTimeout) {
      project.removeReflection(_setTimeout);
      removeItem(IO.children, _setTimeout);
      removeItem(group(IO, "Variables").children, _setTimeout);
    }

    const IOBase = project.getChildByName("IOBase");
    if (!(IOBase instanceof DeclarationReflection))
      throw "Failed to find IOBase";

    project.removeReflection(IOBase);

    const IOType = project
      .getReflectionsByKind(ReflectionKind.TypeAlias)
      .find((reflection) => reflection.name === "IO");

    if (!(IOType instanceof DeclarationReflection))
      throw "Failed to find IO type alias";

    // IOType.groups?.push(group(IOBase, "Methods"));
    IOType.children?.push(...(IOBase.children ?? []));
  });
}

function group(
  reflection: DeclarationReflection,
  groupTitle: string
): ReflectionGroup {
  const group = reflection.groups?.find((group) => group.title === groupTitle);
  if (!group)
    throw `Failed to find group '${groupTitle}' in ${reflection.name}`;
  return group;
}

function removeItem<T>(items: T[] | undefined, item: T): void {
  const index = items?.indexOf(item) ?? -1;
  if (index >= 0) {
    items?.splice(index, 1);
  }
}
