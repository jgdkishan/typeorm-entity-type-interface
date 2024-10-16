#!/usr/bin/env node

import { Project, StructureKind, InterfaceDeclarationStructure, PropertySignatureStructure } from 'ts-morph';
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';

const program = new Command();

program
    .requiredOption('-i, --input <glob>', 'Input glob pattern for TypeORM entities')
    .requiredOption('-o, --output <path>', 'Output directory for interfaces')
    .option('--no-prefix', 'Do not prefix interface names with "I"')
    .option('-v, --verbose', 'Enable verbose output', true);

program.parse(process.argv);

const options = program.opts();

const project = new Project();

const inputPattern = path.resolve(options.input);
const outputDir = path.resolve(options.output);
const usePrefix = options.prefix !== false;
const verbose = options.verbose !== false;

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Read all .ts files matching the input glob pattern
const sourceFiles = project.addSourceFilesAtPaths(inputPattern);

if (sourceFiles.length === 0) {
    console.error(`No files matched the input pattern: ${inputPattern}`);
    process.exit(1);
}

const interfaceMap = new Map<string, string>();

// First pass: collect class names and map to interfaces
sourceFiles.forEach((sourceFile) => {
    sourceFile.getClasses().forEach((classDeclaration) => {
        const className = classDeclaration.getName();
        if (className) {
            const interfaceName = usePrefix ? `I${className}` : className;
            interfaceMap.set(className, interfaceName);
        }
    });
});

// Second pass: generate interfaces
sourceFiles.forEach((sourceFile) => {
    sourceFile.getClasses().forEach((classDeclaration) => {
        const className = classDeclaration.getName();
        if (!className) return;

        const interfaceName = interfaceMap.get(className) as string;

        // Collect properties
        const properties = classDeclaration.getProperties();

        const interfaceProperties: PropertySignatureStructure[] = properties.map((prop) => {
            const propName = prop.getName();
            const decorators = prop.getDecorators().map((dec) => dec.getName());
            const isOptional = prop.hasQuestionToken();

            let propType = prop.getType().getText();

            // Handle relation types
            const relationDecorators = ['OneToMany', 'ManyToOne', 'OneToOne', 'ManyToMany'];
            const hasRelation = decorators.some((dec) => relationDecorators.includes(dec));

            if (hasRelation) {
                // Get the type of the related entity
                const typeNode = prop.getTypeNode();
                if (typeNode && typeNode.getText().includes('Promise')) {
                    // Lazy relations
                    const typeArguments = typeNode.getType().getTypeArguments();
                    if (typeArguments.length > 0) {
                        const relatedType = typeArguments[0];
                        const relatedEntityName = relatedType.getSymbol()?.getName();
                        if (relatedEntityName) {
                            const relatedInterfaceName = interfaceMap.get(relatedEntityName) || relatedEntityName;
                            propType = `Promise<${relatedInterfaceName}>`;
                        } else {
                            propType = 'any';
                        }
                    }
                } else {
                    // Eager relations
                    const type = prop.getType();
                    const elementType = type.getArrayElementType() || type;
                    const relatedEntityName = elementType.getSymbol()?.getName();
                    if (relatedEntityName) {
                        const relatedInterfaceName = interfaceMap.get(relatedEntityName) || relatedEntityName;
                        if (type.isArray()) {
                            propType = `${relatedInterfaceName}[]`;
                        } else {
                            propType = relatedInterfaceName;
                        }
                    } else {
                        propType = 'any';
                    }
                }
            }

            return {
                name: propName,
                type: propType,
                hasQuestionToken: isOptional,
                kind: StructureKind.PropertySignature,
            };
        });

        // Create interface
        const interfaceStructure: InterfaceDeclarationStructure = {
            kind: StructureKind.Interface,
            name: interfaceName,
            properties: interfaceProperties,
            isExported: true,
        };

        // Create a new source file for the interface
        const interfaceFilePath = path.join(outputDir, `${interfaceName}.ts`);
        const interfaceFile = project.createSourceFile(
            interfaceFilePath,
            { statements: [interfaceStructure] },
            { overwrite: true }
        );

        // Add import statements for related interfaces
        const imports: Set<string> = new Set();

        interfaceProperties.forEach((prop) => {
            const propType = prop.type as string;
            const typeNames = propType.match(/(?:Promise<)?([A-Za-z0-9_]+)(?:\[\])?>?/g) || [];
            typeNames.forEach((typeName) => {
                const cleanType = typeName.replace(/(\[\])|Promise<|>/g, '');
                if (interfaceMap.has(cleanType) && cleanType !== interfaceName) {
                    imports.add(cleanType);
                }
            });
        });

        if (imports.size > 0) {
            interfaceFile.addImportDeclarations(
                Array.from(imports).map((importName) => ({
                    namedImports: [importName],
                    moduleSpecifier: `./${importName}`,
                    isTypeOnly: true,
                }))
            );
        }

        // Save the file
        interfaceFile.saveSync();

        if (verbose) {
            console.log(`Generated interface for ${className}: ${interfaceFilePath}`);
        }
    });
});
