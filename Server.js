const express=require('express')
const mongoose=require('mongoose')
const cors=require('cors')
require('dotenv').config()

const server=express()

server.use(cors())
server.use(express.json())
server.use(express.urlencoded({extended:true}))

mongoose.connect(process.env.MYURL).then(()=>{
    console.log("Connected to DB");
}).catch((err)=>{
    console.log(err);
})

const RuleSchema = new mongoose.Schema({
    ruleString: { type: String, required: true },
    ast: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
});

const Rule = mongoose.model('Rule', RuleSchema);

class Node {
    constructor(type, left = null, right = null, value = null) {
        this.type = type; // "operator" or "operand"
        this.left = left; // Reference to left child
        this.right = right; // Reference to right child
        this.value = value; // Value for operand nodes (condition, operator, value)
    }
}

const parseRuleToAST = (ruleString) => {
    // Tokenizer that splits the input into meaningful tokens
    const tokenize = (input) => {
        const regex = /\s*(=>|<=|>=|<|>|==|!=|AND|OR|\(|\)|[a-zA-Z_][a-zA-Z0-9_]*|'.*?'|\d+)\s*/g;
        return input.split(regex).filter(token => token && token.trim());
    };

    // Parse expressions, considering AND/OR operators
    const parseExpression = (tokens) => {
        let leftNode = parseTerm(tokens);

        while (tokens.length > 0) {
            const operator = tokens[0];
            if (operator === 'AND' || operator === 'OR') {
                tokens.shift(); // Remove the operator
                const rightNode = parseTerm(tokens); // Parse the next term
                leftNode = new Node('operator', leftNode, rightNode, operator); // Create a new operator node
            } else {
                break; // No more operators, exit the loop
            }
        }

        return leftNode; // Return the constructed expression
    };

    // Parse individual terms (conditions like `age < 30` or `department = 'Sales'`)
    const parseTerm = (tokens) => {
        const currentToken = tokens.shift(); // Get the current token

        if (currentToken === '(') {
            // If it's an opening parenthesis, parse the expression inside it
            const expressionNode = parseExpression(tokens);
            tokens.shift(); // Remove the closing parenthesis
            return expressionNode;
        }

        // Otherwise, it's a condition (e.g., `age < 30`)
        const operator = tokens.shift(); // Get the operator (e.g., '<')
        const value = tokens.shift(); // Get the value (e.g., 30)
        return new Node('operand', null, null, {
            condition: currentToken,
            operator,
            value: value.startsWith("'") ? value.slice(1, -1) : Number(value) // Handle string or numeric value
        });
    };

    const tokens = tokenize(ruleString); // Tokenize the input rule string
    const ast = parseExpression(tokens); // Parse the expression into an AST
    return ast; // Return the constructed AST
};

// API to create a rule and store it in the database
server.post('/create_rule', async (req, res) => {
    try{
    const { rule_string } = req.body;
    const ast = parseRuleToAST(rule_string);
    const newRule = new Rule({ ruleString: rule_string, ast });
    await newRule.save();
    res.status(201).json({ message: 'Rule created', ast });
    }catch(err) {
        res.status(404).json({message:'error'},ast=null);
    }
});



// API to combine rules
server.post('/combine_rules', async (req, res) => {
    try{
    const { rules } = req.body;
    const combinedAST = combineRules(rules);
    res.json({ message: 'Combined rules', ast: combinedAST });
    }catch(err) {
        res.json({message:err});
    }
});

// Function to combine multiple rule ASTs
const combineRules = (rules) => {
    // For demonstration, just combine them under an AND operator
    let root = new Node('operator', null, null, 'AND');

    rules.forEach(rule => {
        if(rule.length>0) {
        const ast = parseRuleToAST(rule);
        if (!root.left) {
            root.left = ast;
        } else {
            root.right = ast; // This can be enhanced for multiple rules
        }
    }
    });

    return root;
};

// API to evaluate rules
server.post('/evaluate_rule', (req, res) => {
    const { ast, data } = req.body;
    if(ast===null) {
        res.json({result:false});
    }
    const result = evaluateRule(ast, data);
    res.json({result});
});

// Function to evaluate the rule against the provided data
// Function to evaluate a rule based on the AST and provided data
const evaluateRule = (ast, data) => {
    // Helper function to evaluate a single operand
    if(ast===null) {
        return true;
    }
    if (ast!==null &&  ast !== undefined && ast.type === 'operator') {
        const leftValue = evaluateRule(ast.left, data); // Evaluate the left subtree
        const rightValue = evaluateRule(ast.right, data); // Evaluate the right subtree

        // Evaluate the operator (AND / OR)
        if (ast.value === 'AND') {
            return leftValue && rightValue;
        } else if (ast.value === 'OR') {
            return leftValue || rightValue;
        }
    }
    // If the node is an operand (a condition)
    if (ast!==null &&  ast !== undefined && ast.type === 'operand') {
        const { condition, operator, value } = ast.value; // Extract the condition, operator, and value
        const dataValue = data[condition]; // Get the corresponding value from the data

        // Evaluate the condition based on the operator
        switch (operator) {
            case '<':
                return dataValue < value;
            case '>':
                return dataValue > value;
            case '<=':
                return dataValue <= value;
            case '>=':
                return dataValue >= value;
            case '=':
                return dataValue == value; // Loose comparison for equality
            case '!=':
                return dataValue != value; // Loose comparison for inequality
            default:
                return false;
        }
    }

    return false;
};

server.listen((9006),()=>{
    console.log("Server Running in port 9006");
})