#!/usr/bin/env node

import {
    Project,
    StructureKind,
    InterfaceDeclarationStructure,
    PropertySignatureStructure,
} from 'ts-morph';
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';

const program = new Command();

program
    .requiredOption('-i, --input <glob>', 'Input glob pattern for TypeORM entities')
    .requiredOption('-o, --output <path>', 'Output file path for interfaces')
    .option('--no-prefix', 'Do not prefix interface names with "I"')
    .option('-v, --verbose', 'Enable verbose output', true);

program.parse(process.argv);

const options = program.opts();

const project = new Project();

const inputPattern = path.resolve(options.input);
const outputFilePath = path.resolve(options.output);
const usePrefix = options.prefix !== false;
const verbose = options.verbose !== false;
const outputDir = path.dirname(outputFilePath);

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

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

// Prepare to collect all interfaces
const allInterfaces: InterfaceDeclarationStructure[] = [];

// Second pass: generate interfaces
sourceFiles.forEach((sourceFile) => {
    sourceFile.getClasses().forEach((classDeclaration) => {
        const className = classDeclaration.getName();
        if (!className) return;

        const interfaceName = interfaceMap.get(className) as string;
        const interfaceNameData = `${interfaceName}Data`;

        // Collect properties
        const properties = classDeclaration.getProperties();

        const interfaceProperties: PropertySignatureStructure[] = [];
        const interfaceDataProperties: PropertySignatureStructure[] = [];

        properties.forEach((prop) => {
            const propName = prop.getName();
            const decorators = prop.getDecorators().map((dec) => dec.getName());
            const isOptional = prop.hasQuestionToken();

            let propType = prop.getType().getText();

            // Handle relation types
            const relationDecorators = [
                'OneToMany',
                'ManyToOne',
                'OneToOne',
                'ManyToMany',
            ];
            const hasRelation = decorators.some((dec) =>
                relationDecorators.includes(dec)
            );

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
                            const relatedInterfaceName =
                                interfaceMap.get(relatedEntityName) || relatedEntityName;
                            propType = `Promise<${relatedInterfaceName}Data>`;
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
                        const relatedInterfaceName =
                            interfaceMap.get(relatedEntityName) || relatedEntityName;
                        if (type.isArray()) {
                            propType = `${relatedInterfaceName}Data[]`;
                        } else {
                            propType = `${relatedInterfaceName}Data`;
                        }
                    } else {
                        propType = 'any';
                    }
                }
            }

            const propertySignature: PropertySignatureStructure = {
                name: propName,
                type: propType,
                hasQuestionToken: isOptional,
                kind: StructureKind.PropertySignature,
            };

            if (!hasRelation) {
                interfaceProperties.push(propertySignature);
            }

            interfaceDataProperties.push(propertySignature);
        });

        // Create interfaces
        const entityInterface: InterfaceDeclarationStructure = {
            kind: StructureKind.Interface,
            name: interfaceName,
            properties: interfaceProperties,
            isExported: true,
        };

        const entityDataInterface: InterfaceDeclarationStructure = {
            kind: StructureKind.Interface,
            name: interfaceNameData,
            properties: interfaceDataProperties,
            isExported: true,
        };

        allInterfaces.push(entityInterface, entityDataInterface);
    });
});

// Create a new source file for all interfaces
const interfacesFile = project.createSourceFile(
    outputFilePath,
    { statements: allInterfaces },
    { overwrite: true }
);

// Save the file
interfacesFile.saveSync();

if (verbose) {
    console.log(`Generated interfaces file: ${outputFilePath}`);
}
