import { Project, StructureKind, InterfaceDeclarationStructure } from 'ts-morph';
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';

const program = new Command();

program
    .requiredOption('-i, --input <path>', 'Input directory containing TypeORM entities')
    .requiredOption('-o, --output <path>', 'Output directory for interfaces');

program.parse(process.argv);

const options = program.opts();

const project = new Project({
    tsConfigFilePath: path.join(__dirname, '../tsconfig.json'),
});

const inputDir = path.resolve(options.input);
const outputDir = path.resolve(options.output);

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Read all .ts files in the input directory
const sourceFiles = project.addSourceFilesAtPaths(`${inputDir}/**/*.ts`);

sourceFiles.forEach((sourceFile) => {
    const classes = sourceFile.getClasses();
    classes.forEach((classDeclaration) => {
        const className = classDeclaration.getName();
        if (!className) return;

        // Collect properties
        const properties = classDeclaration.getProperties();

        const interfaceProperties = properties.map((prop) => {
            const propName = prop.getName();
            const propType = prop.getType().getText();
            const isOptional = prop.hasQuestionToken();

            return {
                name: propName,
                type: propType,
                hasQuestionToken: isOptional,
            };
        });

        // Create interface
        const interfaceStructure: InterfaceDeclarationStructure = {
            kind: StructureKind.Interface,
            name: `I${className}`,
            properties: interfaceProperties,
            isExported: true,
        };

        // Create a new source file for the interface
        const interfaceFile = project.createSourceFile(
            path.join(outputDir, `${className}.ts`),
            {
                statements: [interfaceStructure],
            },
            { overwrite: true }
        );

        // Save the file
        interfaceFile.saveSync();
    });
});
