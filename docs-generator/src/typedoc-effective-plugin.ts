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

    project.getReflectionsByKind(ReflectionKind.All).forEach((reflection) => {
      switch (`${reflection.kindString}: ${reflection.getFullName()}`) {
        case "Namespace: io.IO": {
          const IO = reflection as DeclarationReflection;
          // Remove private "_setTimeout" function
          const _setTimeout = reflection.getChildByName("_setTimeout");

          if (_setTimeout) {
            project.removeReflection(_setTimeout);
            removeItem(IO.children, _setTimeout);
            removeItem(group(IO, "Variables").children, _setTimeout);
          }
          break;
        }
      }
    });
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
